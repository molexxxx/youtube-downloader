import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { adoptLegacyYtdlp } from '@main/binaries/legacy'

let base: string
let legacy: string
const log = { info: vi.fn(), warn: vi.fn() }

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-'))
  legacy = path.join(base, 'bin')
  fs.mkdirSync(legacy)
  log.info.mockClear()
  log.warn.mockClear()
})

afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true })
})

function write(name: string, content = 'x'): void {
  fs.writeFileSync(path.join(legacy, name), content)
}

describe('adoptLegacyYtdlp', () => {
  it('moves the Windows yt-dlp into the updater folder and deletes the old layout leftovers', () => {
    write('yt-dlp.exe', 'old yt-dlp')
    write('ffmpeg.exe')
    write('ffprobe.exe')
    write('ffmpeg-download-0.zip')
    fs.mkdirSync(path.join(legacy, 'ffmpeg-extract', 'nested'), { recursive: true })
    const target = path.join(base, 'ytdlp-bin', 'yt-dlp.exe')

    adoptLegacyYtdlp(legacy, target, 'win32', log)

    expect(fs.readFileSync(target, 'utf8')).toBe('old yt-dlp')
    expect(fs.readdirSync(legacy).sort()).toEqual(['ffmpeg.exe', 'ffprobe.exe'])
    expect(log.info).toHaveBeenCalledWith(
      `Moved the yt-dlp of an earlier release to ${target}`
    )
  })

  it('moves the macOS build under its new name', () => {
    write('yt-dlp_macos', 'mac yt-dlp')
    const target = path.join(base, 'ytdlp-bin', 'yt-dlp')
    adoptLegacyYtdlp(legacy, target, 'darwin', log)
    expect(fs.readFileSync(target, 'utf8')).toBe('mac yt-dlp')
    expect(fs.readdirSync(legacy)).toEqual([])
  })

  it('discards the Linux zipapp, which needs a system Python, instead of adopting it', () => {
    write('yt-dlp', 'zipapp')
    const target = path.join(base, 'ytdlp-bin', 'yt-dlp')
    adoptLegacyYtdlp(legacy, target, 'linux', log)
    expect(fs.existsSync(target)).toBe(false)
    expect(fs.readdirSync(legacy)).toEqual([])
  })

  it('never replaces a copy the updater already installed', () => {
    write('yt-dlp.exe', 'old yt-dlp')
    const target = path.join(base, 'ytdlp-bin', 'yt-dlp.exe')
    fs.mkdirSync(path.dirname(target))
    fs.writeFileSync(target, 'verified yt-dlp')
    adoptLegacyYtdlp(legacy, target, 'win32', log)
    expect(fs.readFileSync(target, 'utf8')).toBe('verified yt-dlp')
    expect(fs.readdirSync(legacy)).toEqual([])
  })

  it('does nothing without an earlier layout', () => {
    fs.rmSync(legacy, { recursive: true })
    const target = path.join(base, 'ytdlp-bin', 'yt-dlp.exe')
    expect(() => adoptLegacyYtdlp(legacy, target, 'win32', log)).not.toThrow()
    expect(fs.existsSync(target)).toBe(false)
  })
})
