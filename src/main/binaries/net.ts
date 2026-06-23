import { app } from 'electron'
import { createWriteStream } from 'fs'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import { get } from 'https'
import type { IncomingMessage } from 'http'

const USER_AGENT = 'YouTube-Downloader (https://github.com/molexxxx/youtube-downloader)'
const REQUEST_TIMEOUT = 300_000
const MAX_REDIRECTS = 6

export type DownloadProgress = (downloaded: number, total: number | null) => void

/** Directory under userData where managed binaries are stored. */
export function binDir(): string {
  return join(app.getPath('userData'), 'bin')
}

export async function ensureBinDir(): Promise<string> {
  const dir = binDir()
  await mkdir(dir, { recursive: true })
  return dir
}

/**
 * Download a URL to a destination file, following redirects and reporting progress.
 */
export function downloadFile(
  url: string,
  dest: string,
  onProgress?: DownloadProgress,
  depth = 0
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (depth > MAX_REDIRECTS) {
      reject(new Error(`Too many redirects fetching ${url}`))
      return
    }

    const request = get(
      url,
      { headers: { 'User-Agent': USER_AGENT } },
      (response: IncomingMessage) => {
        const status = response.statusCode ?? 0

        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume()
          const next = new URL(response.headers.location, url).toString()
          downloadFile(next, dest, onProgress, depth + 1).then(resolve, reject)
          return
        }

        if (status !== 200) {
          response.resume()
          reject(new Error(`Request failed (${status}) for ${url}`))
          return
        }

        const total = Number(response.headers['content-length']) || null
        let downloaded = 0
        const file = createWriteStream(dest)

        response.on('data', (chunk: Buffer) => {
          downloaded += chunk.length
          onProgress?.(downloaded, total)
        })
        response.pipe(file)

        file.on('finish', () => file.close(() => resolve()))
        file.on('error', reject)
        response.on('error', reject)
      }
    )

    request.setTimeout(REQUEST_TIMEOUT, () => {
      request.destroy(new Error(`Timeout fetching ${url}`))
    })
    request.on('error', reject)
  })
}

/** Resolve the active platform as a narrowed union. */
export function currentPlatform(): 'win32' | 'darwin' | 'linux' {
  const p = process.platform
  if (p === 'win32' || p === 'darwin' || p === 'linux') return p
  throw new Error(`Unsupported platform: ${p}`)
}
