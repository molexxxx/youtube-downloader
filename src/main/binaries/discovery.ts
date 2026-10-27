/**
 * Finds a yt-dlp, and an ffmpeg with its ffprobe, already on this computer, for setup to offer instead of the app's
 * own copies. Only absolute PATH folders are searched; macOS apps launched from Finder do not inherit the shell PATH,
 * so Homebrew's folders are searched there too. Folders the app manages itself are never reported.
 */
import * as fs from 'fs'
import * as path from 'path'

/** The folders searched, in order, without duplicates. */
export function searchDirs(
  platform: NodeJS.Platform,
  envPath: string | undefined
): string[] {
  const delimiter = platform === 'win32' ? ';' : ':'
  const absolute = platform === 'win32' ? path.win32.isAbsolute : path.posix.isAbsolute
  const dirs = (envPath ?? '')
    .split(delimiter)
    .map((d) => d.trim().replace(/^"(.*)"$/, '$1'))
    .filter((d) => d.length > 0 && absolute(d))
  if (platform === 'darwin') dirs.push('/opt/homebrew/bin', '/usr/local/bin')
  return [...new Set(dirs)]
}

function sameOrInside(child: string, parent: string, platform: NodeJS.Platform): boolean {
  const norm = (p: string): string => {
    const resolved = path.resolve(p)
    return platform === 'win32' ? resolved.toLowerCase() : resolved
  }
  const relative = path.relative(norm(parent), norm(child))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

/** Whether `file` can be run: any file on Windows, which runs by name, else one with an execute bit. */
function runnable(file: string, platform: NodeJS.Platform): boolean {
  try {
    if (!fs.statSync(file).isFile()) return false
    if (platform !== 'win32') fs.accessSync(file, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** The first runnable `name` in `dirs` that is not inside one of the `excluded` folders. */
export function findExecutable(
  name: string,
  dirs: readonly string[],
  platform: NodeJS.Platform,
  excluded: readonly string[] = []
): string | null {
  for (const dir of dirs) {
    if (excluded.some((ex) => sameOrInside(dir, ex, platform))) continue
    const file = path.join(dir, name)
    if (runnable(file, platform)) return file
  }
  return null
}

/** The first folder in `dirs` holding both ffmpeg and ffprobe, outside the `excluded` folders. */
export function findFfmpegDir(
  dirs: readonly string[],
  platform: NodeJS.Platform,
  excluded: readonly string[] = []
): string | null {
  const exe = (base: string): string => (platform === 'win32' ? `${base}.exe` : base)
  for (const dir of dirs) {
    if (excluded.some((ex) => sameOrInside(dir, ex, platform))) continue
    if (
      runnable(path.join(dir, exe('ffmpeg')), platform) &&
      runnable(path.join(dir, exe('ffprobe')), platform)
    ) {
      return dir
    }
  }
  return null
}
