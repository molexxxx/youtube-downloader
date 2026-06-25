import { spawn } from 'child_process'
import { PassThrough } from 'stream'
import { createAudioResource, StreamType, type AudioResource } from '@discordjs/voice'
import type { Track } from '@shared/types'
import { getConfig } from '../config'
import { logger } from '../logger'
import { ffmpegPath } from '../binaries/ffmpeg-binary'
import { ytdlpPath } from '../binaries/ytdlp-binary'
import { cookieArgs, cookiesEnabled, isAuthRequiredError } from '../ytdlp/cookies'

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

// Transcode whatever yt-dlp pipes in to 48kHz stereo signed-16 PCM, which Discord
// expects. PCM (not Opus) so @discordjs/voice can apply inline volume; it encodes
// to Opus itself via the pure-JS opusscript encoder.
const FFMPEG_ARGS = [
  '-i',
  'pipe:0',
  '-vn',
  '-ar',
  '48000',
  '-ac',
  '2',
  '-f',
  's16le',
  'pipe:1'
]

/** An AudioResource whose underlying yt-dlp/ffmpeg processes can be torn down. */
export type ManagedAudioResource = AudioResource & { destroyStream: () => void }

interface Pipeline {
  destroy: () => void
}

/**
 * Build a playable audio resource for a track. The yt-dlp -> ffmpeg pipeline feeds
 * a single PassThrough that backs the resource, so a transparent cookie retry
 * (after an auth failure that produced no audio) can swap the source mid-flight
 * without the AudioPlayer noticing.
 */
export function createTrackResource(track: Track): ManagedAudioResource {
  const output = new PassThrough()
  let bytesSeen = 0
  let retried = false
  let active: Pipeline | null = null

  const start = (withCookies: boolean): void => {
    let alive = true
    const ytdlp = spawn(ytdlpPath(), buildStreamArgs(track.url, withCookies))
    const ffmpeg = spawn(ffmpegPath(), FFMPEG_ARGS)
    ytdlp.stdout.pipe(ffmpeg.stdin)
    // yt-dlp dying first closes ffmpeg's stdin; ignore the resulting EPIPE.
    ffmpeg.stdin.on('error', () => {})
    ytdlp.on('error', (err) => logger.warn('yt-dlp stream failed to start:', err.message))
    ffmpeg.on('error', (err) => logger.warn('ffmpeg stream failed to start:', err.message))

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

    ffmpeg.stdout.on('data', (chunk: Buffer) => {
      if (!alive) return
      bytesSeen += chunk.length
      output.write(chunk)
    })
    ffmpeg.stdout.on('end', () => {
      if (alive) output.end()
    })

    ytdlp.on('close', (code) => {
      if (!alive || code === 0) return
      // No audio produced. Retry once with cookies when the failure looks like an
      // auth gate (private / age-restricted / members-only) and cookies exist.
      if (bytesSeen === 0 && !retried && cookiesEnabled() && isAuthRequiredError(stderr)) {
        retried = true
        alive = false
        ffmpeg.kill('SIGKILL')
        logger.warn('Discord stream needs auth, retrying with cookies:', track.title)
        start(true)
        return
      }
      if (bytesSeen === 0) {
        logger.warn('Discord stream produced no audio:', track.title, stderr.slice(-200).trim())
        output.end()
      }
    })
  }

  start(false)

  const resource = createAudioResource(output, {
    inputType: StreamType.Raw,
    inlineVolume: true
  }) as ManagedAudioResource
  resource.destroyStream = (): void => {
    active?.destroy()
    output.destroy()
  }
  return resource
}
