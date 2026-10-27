import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { findExecutable, findFfmpegDir, searchDirs } from '@main/binaries/discovery'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'discovery-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

function file(...parts: string[]): string {
  const full = path.join(root, ...parts)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, 'x', { mode: 0o755 })
  return full
}

describe('searchDirs', () => {
  it('keeps absolute, unquoted PATH folders once, in order', () => {
    expect(
      searchDirs('win32', ['', 'relative', 'C:\\a', '"C:\\b b"', 'C:\\a'].join(';'))
    ).toEqual(['C:\\a', 'C:\\b b'])
    expect(searchDirs('linux', undefined)).toEqual([])
  })

  it('adds the Homebrew folders on macOS, where Finder launches skip the shell PATH', () => {
    expect(searchDirs('darwin', '/usr/bin')).toEqual([
      '/usr/bin',
      '/opt/homebrew/bin',
      '/usr/local/bin'
    ])
  })
})

describe('findExecutable', () => {
  it('takes the first file by that name, skipping folders and the app folders', () => {
    const app = path.join(root, 'userData')
    file('userData', 'ytdlp-bin', 'yt-dlp.exe')
    fs.mkdirSync(path.join(root, 'a', 'yt-dlp.exe'), { recursive: true })
    const wanted = file('b', 'yt-dlp.exe')
    const dirs = [path.join(app, 'ytdlp-bin'), path.join(root, 'a'), path.join(root, 'b')]
    expect(findExecutable('yt-dlp.exe', dirs, 'win32', [app])).toBe(wanted)
    expect(findExecutable('yt-dlp.exe', [path.join(root, 'none')], 'win32')).toBeNull()
  })

  it('needs the execute bit off Windows', () => {
    if (process.platform === 'win32') return
    const plain = file('c', 'yt-dlp')
    fs.chmodSync(plain, 0o644)
    expect(findExecutable('yt-dlp', [path.join(root, 'c')], 'linux')).toBeNull()
    fs.chmodSync(plain, 0o755)
    expect(findExecutable('yt-dlp', [path.join(root, 'c')], 'linux')).toBe(plain)
  })
})

describe('findFfmpegDir', () => {
  it('takes the first folder with both ffmpeg and ffprobe', () => {
    file('only-ffmpeg', 'ffmpeg.exe')
    file('both', 'ffmpeg.exe')
    file('both', 'ffprobe.exe')
    const dirs = [path.join(root, 'only-ffmpeg'), path.join(root, 'both')]
    expect(findFfmpegDir(dirs, 'win32')).toBe(path.join(root, 'both'))
    expect(findFfmpegDir(dirs, 'win32', [path.join(root, 'both')])).toBeNull()
  })
})
