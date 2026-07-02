import { protocol } from 'electron'
import { createReadStream, existsSync, statSync } from 'fs'
import { Readable } from 'stream'
import { basename, extname } from 'path'
import type { LocalAudioFile } from '@shared/types'
import { logger } from './logger'

export const LOCAL_MEDIA_SCHEME = 'local-media'

/** Audio containers the import UI accepts (matched against the extension). */
export const AUDIO_EXTENSIONS = [
  'mp3',
  'm4a',
  'aac',
  'opus',
  'ogg',
  'oga',
  'flac',
  'wav',
  'wma',
  'webm',
  'mka'
]

/** Content types Chromium's media stack understands, by extension. */
const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  opus: 'audio/ogg',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  flac: 'audio/flac',
  wav: 'audio/wav',
  wma: 'audio/x-ms-wma',
  webm: 'audio/webm',
  mka: 'audio/x-matroska'
}

// Only paths the user explicitly imported (file picker or drag-and-drop) may be
// streamed through the scheme - the renderer can never read arbitrary disk paths.
const allowedPaths = new Set<string>()

/** Streamable URL for an allowed path. */
export function localMediaUrl(path: string): string {
  return `${LOCAL_MEDIA_SCHEME}://audio/${encodeURIComponent(path)}`
}

export function isAudioFile(path: string): boolean {
  return AUDIO_EXTENSIONS.includes(extname(path).slice(1).toLowerCase())
}

/**
 * Parse an HTTP Range header against a resource of `size` bytes. Returns the
 * inclusive byte window, or null for absent/malformed/unsatisfiable ranges.
 * Pure function - unit tested.
 */
export function parseRangeHeader(
  header: string | null,
  size: number
): { start: number; end: number } | null {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (match[1] === '' && match[2] === '')) return null
  // Suffix form (bytes=-N): the final N bytes.
  if (match[1] === '') {
    const suffix = Math.min(Number(match[2]), size)
    return suffix > 0 ? { start: size - suffix, end: size - 1 } : null
  }
  const start = Number(match[1])
  if (start >= size) return null
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  return end >= start ? { start, end } : null
}

/**
 * Read the whole file once in the background, discarding the data. The first
 * read of a newly imported file can stall for seconds (antivirus scan, cold
 * disk) - long enough to starve the voice encoder and kill the track. Paying
 * that cost at import time keeps first playback smooth.
 */
function warmFileCache(path: string): void {
  const stream = createReadStream(path)
  stream.on('data', () => {})
  stream.on('error', () => {})
}

/**
 * Validate a set of paths (picked or dropped), remember them as streamable, and
 * describe them for the renderer. Non-audio and missing files are skipped.
 */
export function importLocalAudio(paths: string[]): LocalAudioFile[] {
  const files: LocalAudioFile[] = []
  for (const path of paths) {
    if (!isAudioFile(path) || !existsSync(path)) continue
    if (!allowedPaths.has(path)) warmFileCache(path)
    allowedPaths.add(path)
    files.push({
      path,
      name: basename(path),
      size: statSync(path).size,
      mediaUrl: localMediaUrl(path)
    })
  }
  return files
}

/**
 * Must run before app.whenReady(): privileged schemes can only be registered
 * during startup. `stream` enables media loading over the scheme.
 */
export function registerLocalMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: LOCAL_MEDIA_SCHEME,
      privileges: { stream: true, supportFetchAPI: true }
    }
  ])
}

/**
 * Wire the scheme's handler; call after app.whenReady().
 *
 * Range requests are honored with real 206 responses: Chromium's media stack
 * aborts its first request once it has buffered enough and later re-requests
 * from an offset - answering those with a full 200 body makes <audio> error
 * out mid-playback (previews died after a few seconds).
 */
export function registerLocalMediaProtocol(): void {
  protocol.handle(LOCAL_MEDIA_SCHEME, (request) => {
    const encoded = new URL(request.url).pathname.replace(/^\//, '')
    const path = decodeURIComponent(encoded)
    if (!allowedPaths.has(path)) {
      logger.warn('Blocked local-media request for non-imported path')
      return new Response(null, { status: 403 })
    }
    if (!existsSync(path)) return new Response(null, { status: 404 })

    const size = statSync(path).size
    const mime =
      AUDIO_MIME[extname(path).slice(1).toLowerCase()] ?? 'application/octet-stream'
    const rangeHeader = request.headers.get('range')
    const range = parseRangeHeader(rangeHeader, size)

    if (rangeHeader && !range) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` }
      })
    }

    const { start, end } = range ?? { start: 0, end: size - 1 }
    const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream

    return new Response(body, {
      status: range ? 206 : 200,
      headers: {
        'Content-Type': mime,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {})
      }
    })
  })
}
