import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import { PassThrough } from 'stream'
import { createAudioResource, StreamType, type AudioResource } from '@discordjs/voice'
import type { Track } from '@shared/types'
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
 * ffmpeg args to transcode `input` (pipe:0 or a local file path) to 48kHz stereo
 * signed-16 PCM, which Discord expects. PCM (not Opus) so @discordjs/voice can
 * apply inline volume; it encodes to Opus itself (natively via @discordjs/opus).
 *
 * Seeking: local files take `-ss` as an input option (instant keyframe seek).
 * Piped input is NOT seekable - input-side `-ss` on a pipe corrupts the decode
 * for some containers - so streams seek as an output option, decoding and
 * discarding up to the target instead.
 */
export function buildFfmpegArgs(input: string, seekSeconds = 0): string[] {
  const seekable = input !== 'pipe:0'
  const seek = seekSeconds > 0 ? ['-ss', String(seekSeconds)] : []
  return [
    ...(seekable ? seek : []),
    '-i',
    input,
    ...(seekable ? [] : seek),
    '-vn',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-f',
    's16le',
    'pipe:1'
  ]
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
export function createTrackResource(track: Track, seekSeconds = 0): ManagedAudioResource {
  const output = new PassThrough({ highWaterMark: PCM_BUFFER_BYTES })
  let bytesSeen = 0
  let retried = false
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
    const ffmpeg = spawn(ffmpegPath(), buildFfmpegArgs(filePath, seekSeconds))
    ffmpeg.on('error', (err) =>
      logger.warn('ffmpeg stream failed to start:', err.message)
    )
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
    const ffmpeg = spawn(ffmpegPath(), buildFfmpegArgs('pipe:0', seekSeconds))
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

  if (localFile) {
    logger.debug('Discord playback from local file:', track.title)
    startLocal(localFile)
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
