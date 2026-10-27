/**
 * The binary layout of releases up to 1.4.18, which downloaded yt-dlp, ffmpeg, and ffprobe unverified into
 * `<userData>/bin`. The FFmpeg installer keeps running ffmpeg from there until the pinned build is installed.
 */
import * as fs from 'fs'
import * as path from 'path'

/** The yt-dlp file name those releases used, per platform. Linux is absent: it got the zipapp, which needs Python. */
const LEGACY_YTDLP: Partial<Record<NodeJS.Platform, string>> = {
  win32: 'yt-dlp.exe',
  darwin: 'yt-dlp_macos'
}

const STALE_NAMES = ['yt-dlp', 'yt-dlp.exe', 'yt-dlp_macos', 'ffmpeg-extract']

function isFile(file: string): boolean {
  try {
    return fs.statSync(file).isFile()
  } catch {
    return false
  }
}

/**
 * Moves the yt-dlp an earlier release downloaded to where the updater keeps its copy, so updating the app does not
 * download it again; the next check replaces it with a verified release. Then deletes the other yt-dlp files and
 * interrupted FFmpeg downloads of the old layout. Never throws.
 */
export function adoptLegacyYtdlp(
  legacyDir: string,
  target: string,
  platform: NodeJS.Platform,
  log: { info(...parts: unknown[]): void; warn(...parts: unknown[]): void }
): void {
  const name = LEGACY_YTDLP[platform]
  const source = name ? path.join(legacyDir, name) : null
  if (source && isFile(source) && !isFile(target)) {
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.renameSync(source, target)
      log.info(`Moved the yt-dlp of an earlier release to ${target}`)
    } catch (err) {
      log.warn('Could not move the yt-dlp of an earlier release:', err)
    }
  }
  let entries: string[]
  try {
    entries = fs.readdirSync(legacyDir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (STALE_NAMES.includes(entry) || entry.startsWith('ffmpeg-download-')) {
      try {
        fs.rmSync(path.join(legacyDir, entry), { recursive: true, force: true })
      } catch (err) {
        log.warn(`Could not remove ${entry} from ${legacyDir}:`, err)
      }
    }
  }
}
