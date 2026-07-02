import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import { PassThrough } from 'stream'
import { createAudioResource, StreamType, type AudioResource } from '@discordjs/voice'
import { DEFAULT_AUDIO_EFFECTS, type AudioEffects, type Track } from '@shared/types'
import { getConfig } from '../config'
import { logger } from '../logger'
import { ffmpegPath } from '../binaries/ffmpeg-binary'
import { ytdlpPath } from '../binaries/ytdlp-binary'
import { cookieArgs, cookiesEnabled, isAuthRequiredError } from '../ytdlp/cookies'
import { boostProcessPriority } from './windows-tuning'

/**
 * yt-dlp args to stream a single track's best audio to stdout. Pure function -
 * unit tested. Mirrors the cookie-free-first strategy used by the downloader:
 * cookies are only added when {@link createTrackResource} retries after an auth
 * failure.
 */
export function buildStreamArgs(url: string, withCookies: boolean): string[] {
  const args = [
    url,
    '--ignore-config',
    '--no-warnings',
    '--no-check-certificates',
    '--no-playlist',
    '-f',
    'bestaudio/best',
    '-o',
    '-',
    '--quiet'
  ]
  if (withCookies) args.push(...cookieArgs(getConfig()))
  return args
}

/**
 * yt-dlp args to print the track's direct media URL (`-g`) instead of piping
 * the bytes. Used for mid-track restarts (seek, effects changes): ffmpeg can
 * input-seek an HTTP URL with a range request in ~a second, while seeking the
 * piped stream means re-downloading and decoding everything up to the target.
 * Pure function - unit tested.
 */
export function buildResolveUrlArgs(url: string, withCookies: boolean): string[] {
  const args = [
    url,
    '--ignore-config',
    '--no-warnings',
    '--no-check-certificates',
    '--no-playlist',
    '-f',
    'bestaudio/best',
    '-g',
    '--quiet'
  ]
  if (withCookies) args.push(...cookieArgs(getConfig()))
  return args
}

/** Discord voice sample rate; the pitch shifter resamples back to this. */
const SAMPLE_RATE = 48_000

/** Fixed parameters for the mutually exclusive character effects. Frequencies
 * and depths follow ffmpeg defaults and Lavalink's Discord-bot conventions
 * (tremolo/vibrato ~depth 0.5, rotation a slow 0.15 Hz stereo sweep). */
const EFFECT_FILTERS: Record<Exclude<AudioEffects['mode'], 'none'>, string> = {
  tremolo: 'tremolo=f=4:d=0.6',
  vibrato: 'vibrato=f=5:d=0.5',
  rotate: 'apulsator=hz=0.15',
  // Out-of-phase channel subtraction cancels center-panned vocals.
  karaoke: 'pan=stereo|c0=0.6*c0+-0.6*c1|c1=0.6*c1+-0.6*c0',
  echo: 'aecho=0.8:0.55:220:0.35'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Sanitize renderer-supplied effects: clamp knobs, drop unknown modes. */
export function sanitizeEffects(effects: Partial<AudioEffects> | null): AudioEffects {
  const base = { ...DEFAULT_AUDIO_EFFECTS, ...effects }
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback
  return {
    speed: clamp(num(base.speed, 1), 0.5, 2),
    pitch: clamp(num(base.pitch, 1), 0.5, 2),
    bassGain: clamp(num(base.bassGain, 0), -12, 12),
    midGain: clamp(num(base.midGain, 0), -12, 12),
    trebleGain: clamp(num(base.trebleGain, 0), -12, 12),
    mode: base.mode in EFFECT_FILTERS ? base.mode : 'none'
  }
}

export function effectsActive(effects: AudioEffects): boolean {
  return (
    effects.speed !== 1 ||
    effects.pitch !== 1 ||
    effects.bassGain !== 0 ||
    effects.midGain !== 0 ||
    effects.trebleGain !== 0 ||
    effects.mode !== 'none'
  )
}

/** atempo only accepts 0.5-2 per instance; split larger corrections in two. */
function atempoChain(factor: number): string[] {
  if (Math.abs(factor - 1) < 1e-3) return []
  if (factor >= 0.5 && factor <= 2) return [`atempo=${factor.toFixed(4)}`]
  const half = Math.sqrt(factor)
  return [`atempo=${half.toFixed(4)}`, `atempo=${half.toFixed(4)}`]
}

/**
 * ffmpeg `-af` chain for the given effects, or null when everything is at its
 * default. Pure function - unit tested. Order: pitch (asetrate + resample back
 * to 48kHz) -> tempo compensation -> tone (bass/mid/treble) -> character
 * effect -> limiter (only when boosting, to keep s16 output from clipping).
 */
export function buildAudioFilterChain(effects: AudioEffects): string | null {
  const fx = sanitizeEffects(effects)
  if (!effectsActive(fx)) return null

  const chain: string[] = []
  if (fx.pitch !== 1) {
    chain.push(
      `asetrate=${Math.round(SAMPLE_RATE * fx.pitch)}`,
      `aresample=${SAMPLE_RATE}`
    )
  }
  // asetrate already scales tempo by `pitch`; atempo covers the remainder so
  // the perceived speed always equals `speed` regardless of pitch.
  chain.push(...atempoChain(fx.speed / fx.pitch))
  if (fx.bassGain !== 0) chain.push(`bass=g=${fx.bassGain}`)
  if (fx.midGain !== 0) chain.push(`equalizer=f=1000:t=q:w=1:g=${fx.midGain}`)
  if (fx.trebleGain !== 0) chain.push(`treble=g=${fx.trebleGain}`)
  if (fx.mode !== 'none') chain.push(EFFECT_FILTERS[fx.mode])
  if (fx.bassGain > 0 || fx.midGain > 0 || fx.trebleGain > 0) {
    chain.push('alimiter=limit=0.97')
  }
  return chain.length > 0 ? chain.join(',') : null
}

/**
 * ffmpeg args to transcode `input` (pipe:0, a local file path, or a direct
 * media URL) to 48kHz stereo signed-16 PCM, which Discord expects. PCM (not
 * Opus) so @discordjs/voice can apply inline volume; it encodes to Opus itself
 * (natively via @discordjs/opus).
 *
 * Seeking: local files and HTTP URLs take `-ss` as an input option (instant
 * keyframe / range-request seek). Piped input is NOT seekable - input-side
 * `-ss` on a pipe corrupts the decode for some containers - so pipes seek as
 * an output option, decoding and discarding up to the target instead.
 */
export function buildFfmpegArgs(
  input: string,
  seekSeconds = 0,
  effects: AudioEffects = DEFAULT_AUDIO_EFFECTS
): string[] {
  const seekable = input !== 'pipe:0'
  const isHttp = /^https?:\/\//i.test(input)
  const seek = seekSeconds > 0 ? ['-ss', String(seekSeconds)] : []
  const filterChain = buildAudioFilterChain(effects)
  return [
    // Survive transient CDN drops instead of ending the track early.
    ...(isHttp
      ? ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '4']
      : []),
    ...(seekable ? seek : []),
    '-i',
    input,
    ...(seekable ? [] : seek),
    '-vn',
    ...(filterChain ? ['-af', filterChain] : []),
    '-ar',
    '48000',
    '-ac',
    '2',
    '-f',
    's16le',
    'pipe:1'
  ]
}

/**
 * Media duration in seconds parsed from ffmpeg's stderr banner
 * (`Duration: 00:03:25.66`), or null when it isn't reported (e.g. raw pipes).
 * Pure function - unit tested.
 */
export function parseFfmpegDuration(stderr: string): number | null {
  const match = /Duration:\s*(\d+):(\d{2}):(\d{2})\.(\d+)/.exec(stderr)
  if (!match) return null
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
  return seconds > 0 ? seconds : null
}

/** An AudioResource whose underlying yt-dlp/ffmpeg processes can be torn down. */
export type ManagedAudioResource = AudioResource & { destroyStream: () => void }

interface Pipeline {
  destroy: () => void
}

const PCM_BYTES_PER_SECOND = 48_000 * 2 * 2
const PCM_FRAME_SIZE_BYTES = (PCM_BYTES_PER_SECOND * 20) / 1000
/** Buffered PCM the resource keeps ahead of playback (network-stall cushion). */
const PCM_BUFFER_BYTES = PCM_BYTES_PER_SECOND * 20
/** PCM collected before playback starts, so it never begins on an empty tank. */
const PREBUFFER_BYTES = PCM_BYTES_PER_SECOND * 2

export function createSteadyPcmChunker(
  onChunk: (chunk: Buffer) => void,
  onEnd?: () => void
): PassThrough {
  const output = new PassThrough()
  let pending = Buffer.alloc(0)

  output.on('data', (chunk: Buffer) => {
    pending = Buffer.concat([pending, chunk])
    while (pending.length >= PCM_FRAME_SIZE_BYTES) {
      const frame = pending.subarray(0, PCM_FRAME_SIZE_BYTES)
      onChunk(Buffer.from(frame))
      pending = pending.subarray(PCM_FRAME_SIZE_BYTES)
    }
  })

  output.on('end', () => {
    if (pending.length > 0) {
      onChunk(Buffer.from(pending))
    }
    onEnd?.()
  })

  return output
}

/**
 * Build a playable audio resource for a track. The yt-dlp -> ffmpeg pipeline feeds
 * a single PassThrough that backs the resource, so a transparent cookie retry
 * (after an auth failure that produced no audio) can swap the source mid-flight
 * without the AudioPlayer noticing. Tracks with an existing local file skip
 * yt-dlp entirely and let ffmpeg read the file.
 *
 * Playback is held in Buffering until ~2s of PCM is collected, and up to ~20s is
 * kept buffered ahead with backpressure to the decoder, so brief network stalls
 * and host CPU spikes no longer starve the encoder.
 */
export function createTrackResource(
  track: Track,
  seekSeconds = 0,
  effects: AudioEffects = DEFAULT_AUDIO_EFFECTS,
  onDuration?: (seconds: number) => void
): ManagedAudioResource {
  const output = new PassThrough({ highWaterMark: PCM_BUFFER_BYTES })
  let durationReported = false

  // Tracks queued from downloads or local imports often carry no duration; the
  // ffmpeg banner knows it, and the UI needs it for a live seek bar.
  const watchDuration = (ffmpeg: ChildProcessWithoutNullStreams): void => {
    if (!onDuration) return
    let banner = ''
    const listener = (chunk: Buffer): void => {
      if (durationReported || banner.length > 8192) {
        ffmpeg.stderr.removeListener('data', listener)
        return
      }
      banner += chunk.toString()
      const seconds = parseFfmpegDuration(banner)
      if (seconds != null) {
        durationReported = true
        ffmpeg.stderr.removeListener('data', listener)
        onDuration(seconds)
      }
    }
    ffmpeg.stderr.on('data', listener)
  }
  let bytesSeen = 0
  let retried = false
  let directFellBack = false
  const spawnedAt = Date.now()
  let active: Pipeline | null = null
  let sourceStdout: NodeJS.ReadableStream | null = null
  let prebuffering = true
  let prebuffered: Buffer[] = []
  let prebufferedBytes = 0

  const writeFrame = (chunk: Buffer): void => {
    if (!output.write(chunk)) {
      sourceStdout?.pause()
    }
  }

  output.on('drain', () => {
    sourceStdout?.resume()
  })

  const flushPrebuffer = (): void => {
    if (!prebuffering) return
    prebuffering = false
    // Surface pathological time-to-first-audio (stalled source, slow seek
    // path) - these otherwise present as a silently "dead" player.
    const waitedMs = Date.now() - spawnedAt
    if (waitedMs > 10_000) {
      logger.warn(
        `Stream took ${Math.round(waitedMs / 1000)}s to produce audio:`,
        track.title
      )
    }
    for (const chunk of prebuffered) writeFrame(chunk)
    prebuffered = []
  }

  const steadyOutput = createSteadyPcmChunker(
    (chunk) => {
      if (prebuffering) {
        prebuffered.push(chunk)
        prebufferedBytes += chunk.length
        if (prebufferedBytes >= PREBUFFER_BYTES) flushPrebuffer()
        return
      }
      writeFrame(chunk)
    },
    () => {
      flushPrebuffer()
      output.end()
    }
  )

  const localFile = track.filePath && existsSync(track.filePath) ? track.filePath : null

  const wireFfmpegOutput = (
    ffmpeg: ChildProcessWithoutNullStreams,
    isAlive: () => boolean
  ): void => {
    boostProcessPriority(ffmpeg.pid)
    sourceStdout = ffmpeg.stdout
    ffmpeg.stdout.on('data', (chunk: Buffer) => {
      if (!isAlive()) return
      bytesSeen += chunk.length
      steadyOutput.write(chunk)
    })
    ffmpeg.stdout.on('end', () => {
      if (isAlive()) steadyOutput.end()
    })
  }

  const startLocal = (filePath: string): void => {
    let alive = true
    const ffmpeg = spawn(ffmpegPath(), buildFfmpegArgs(filePath, seekSeconds, effects))
    ffmpeg.on('error', (err) =>
      logger.warn('ffmpeg stream failed to start:', err.message)
    )
    watchDuration(ffmpeg)
    ffmpeg.stderr.on('data', () => {})
    ffmpeg.on('close', (code) => {
      if (alive && code !== 0 && bytesSeen === 0) {
        logger.warn('Discord local playback produced no audio:', track.title)
        output.end()
      }
    })
    wireFfmpegOutput(ffmpeg, () => alive)
    active = {
      destroy: () => {
        alive = false
        ffmpeg.kill('SIGKILL')
      }
    }
  }

  const startStream = (withCookies: boolean): void => {
    let alive = true
    const ytdlp = spawn(ytdlpPath(), buildStreamArgs(track.url, withCookies))
    const ffmpeg = spawn(ffmpegPath(), buildFfmpegArgs('pipe:0', seekSeconds, effects))
    ytdlp.stdout.pipe(ffmpeg.stdin)
    // yt-dlp dying first closes ffmpeg's stdin; ignore the resulting EPIPE.
    ffmpeg.stdin.on('error', () => {})
    ytdlp.on('error', (err) => logger.warn('yt-dlp stream failed to start:', err.message))
    ffmpeg.on('error', (err) =>
      logger.warn('ffmpeg stream failed to start:', err.message)
    )

    active = {
      destroy: () => {
        alive = false
        ytdlp.kill('SIGKILL')
        ffmpeg.kill('SIGKILL')
      }
    }

    let stderr = ''
    ytdlp.stderr.on('data', (b: Buffer) => {
      stderr += b.toString()
    })
    watchDuration(ffmpeg)
    ffmpeg.stderr.on('data', () => {})

    wireFfmpegOutput(ffmpeg, () => alive)

    ytdlp.on('close', (code) => {
      if (!alive || code === 0) return
      // No audio produced. Retry once with cookies when the failure looks like an
      // auth gate (private / age-restricted / members-only) and cookies exist.
      if (
        bytesSeen === 0 &&
        !retried &&
        cookiesEnabled() &&
        isAuthRequiredError(stderr)
      ) {
        retried = true
        alive = false
        ffmpeg.kill('SIGKILL')
        logger.warn('Discord stream needs auth, retrying with cookies:', track.title)
        startStream(true)
        return
      }
      if (bytesSeen === 0) {
        logger.warn(
          'Discord stream produced no audio:',
          track.title,
          stderr.slice(-200).trim()
        )
        output.end()
      }
    })
  }

  /**
   * Mid-track restart (seek, effects change): resolve the direct media URL
   * with `yt-dlp -g`, then let ffmpeg input-seek it over HTTP - audio in ~1-2s.
   * The piped path would re-download from zero and decode up to the target,
   * which stalled playback for 20-40s on far seeks. Falls back to the piped
   * path whenever resolution fails or the direct stream yields no audio.
   */
  const startStreamAtPosition = (withCookies: boolean): void => {
    let alive = true
    const resolver = spawn(ytdlpPath(), buildResolveUrlArgs(track.url, withCookies))
    let out = ''
    let err = ''
    resolver.stdout.on('data', (b: Buffer) => {
      out += b.toString()
    })
    resolver.stderr.on('data', (b: Buffer) => {
      err += b.toString()
    })
    resolver.on('error', (e) =>
      logger.warn('yt-dlp URL resolve failed to start:', e.message)
    )
    active = {
      destroy: () => {
        alive = false
        resolver.kill('SIGKILL')
      }
    }

    resolver.on('close', (code) => {
      if (!alive) return
      const directUrl = out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => /^https?:\/\//i.test(line))
      if (code !== 0 || !directUrl) {
        logger.warn(
          'Direct URL resolve failed, using piped seek:',
          track.title,
          err.slice(-150).trim()
        )
        startStream(withCookies)
        return
      }

      const ffmpeg = spawn(ffmpegPath(), buildFfmpegArgs(directUrl, seekSeconds, effects))
      ffmpeg.on('error', (e) => logger.warn('ffmpeg stream failed to start:', e.message))
      watchDuration(ffmpeg)
      ffmpeg.stderr.on('data', () => {})
      ffmpeg.on('close', (ffmpegCode) => {
        if (!alive || ffmpegCode === 0) return
        // Direct URL rejected (expired signature, IP-locked, 403): retry once
        // through the piped path, which handles auth via the cookie fallback.
        if (bytesSeen === 0 && !directFellBack) {
          directFellBack = true
          alive = false
          logger.warn('Direct stream produced no audio, using piped seek:', track.title)
          startStream(withCookies)
        }
      })
      wireFfmpegOutput(ffmpeg, () => alive)
      active = {
        destroy: () => {
          alive = false
          ffmpeg.kill('SIGKILL')
        }
      }
    })
  }

  if (localFile) {
    logger.debug('Discord playback from local file:', track.title)
    startLocal(localFile)
  } else if (seekSeconds > 0) {
    startStreamAtPosition(false)
  } else {
    startStream(false)
  }

  const resource = createAudioResource(output, {
    inputType: StreamType.Raw,
    inlineVolume: true
  }) as ManagedAudioResource
  resource.destroyStream = (): void => {
    active?.destroy()
    steadyOutput.destroy()
    output.destroy()
  }
  return resource
}
