import { describe, expect, it, vi, beforeEach } from 'vitest'
import { join } from 'path'
import type { BootstrapProgress } from '@shared/types'

const {
  state,
  downloadFileMock,
  ensureBinDirMock,
  chmodMock,
  mkdirMock,
  renameMock,
  rmMock,
  statMock,
  readdirMock,
  extractZipMock,
  tarXMock
} = vi.hoisted(() => ({
  state: {
    exists: false,
    version: 'ffmpeg version 7.1 Copyright',
    execFails: false,
    platform: 'linux' as string
  },
  downloadFileMock: vi.fn(
    (_url: string, _dest: string, onProgress?: (d: number, t: number | null) => void) => {
      onProgress?.(512, 1024)
      return Promise.resolve()
    }
  ),
  ensureBinDirMock: vi.fn(() => Promise.resolve('/userdata/bin')),
  chmodMock: vi.fn(() => Promise.resolve()),
  mkdirMock: vi.fn(() => Promise.resolve()),
  renameMock: vi.fn(() => Promise.resolve()),
  rmMock: vi.fn(() => Promise.resolve()),
  statMock: vi.fn(),
  readdirMock: vi.fn(),
  extractZipMock: vi.fn(() => Promise.resolve()),
  tarXMock: vi.fn(() => Promise.resolve())
}))

vi.mock('@main/binaries/net', () => ({
  binDir: () => '/userdata/bin',
  ensureBinDir: ensureBinDirMock,
  downloadFile: downloadFileMock,
  currentPlatform: () => state.platform
}))
vi.mock('fs/promises', () => ({
  chmod: chmodMock,
  mkdir: mkdirMock,
  readdir: (...args: unknown[]) => readdirMock(...args),
  rename: renameMock,
  rm: rmMock,
  stat: (...args: unknown[]) => statMock(...args)
}))
vi.mock('fs', () => ({
  createReadStream: vi.fn(() => ({}))
}))
vi.mock('stream/promises', () => ({
  pipeline: vi.fn(() => Promise.resolve())
}))
vi.mock('zlib', () => ({
  createGunzip: vi.fn(() => ({}))
}))
vi.mock('extract-zip', () => ({ default: extractZipMock }))
vi.mock('tar', () => ({ x: tarXMock }))
vi.mock('child_process', () => ({
  execFile: (
    _file: string,
    _args: string[],
    _opts: unknown,
    cb: (err: Error | null, out?: { stdout: string }) => void
  ) => {
    if (state.execFails) cb(new Error('boom'))
    else cb(null, { stdout: state.version })
  }
}))

import {
  ffmpegPath,
  ffmpegDir,
  ffmpegVersion,
  ffmpegStatus,
  ensureFfmpeg,
  updateFfmpeg
} from '@main/binaries/ffmpeg-binary'

const BIN = join('/userdata/bin', 'ffmpeg')

function fileEntry(name: string): { name: string; isDirectory: () => boolean } {
  return { name, isDirectory: () => false }
}

beforeEach(() => {
  state.exists = false
  state.version = 'ffmpeg version 7.1 Copyright'
  state.execFails = false
  state.platform = 'linux'
  downloadFileMock.mockClear()
  ensureBinDirMock.mockClear()
  chmodMock.mockClear()
  renameMock.mockClear()
  rmMock.mockClear()
  extractZipMock.mockClear()
  tarXMock.mockClear()
  statMock.mockReset()
  statMock.mockImplementation(() => {
    if (state.exists) return Promise.resolve({})
    return Promise.reject(new Error('missing'))
  })
  readdirMock.mockReset()
  readdirMock.mockResolvedValue([fileEntry('ffmpeg'), fileEntry('ffprobe')])
})

describe('ffmpegPath / ffmpegDir', () => {
  it('returns the ffmpeg executable under the bin dir', () => {
    expect(ffmpegPath()).toBe(BIN)
    expect(ffmpegDir()).toBe('/userdata/bin')
  })

  it('uses the .exe suffix on Windows', () => {
    state.platform = 'win32'
    expect(ffmpegPath()).toBe(join('/userdata/bin', 'ffmpeg.exe'))
  })
})

describe('ffmpegVersion', () => {
  it('parses the version token from -version output', async () => {
    state.version = 'ffmpeg version 7.1.1 Copyright (c) the FFmpeg developers'
    expect(await ffmpegVersion(BIN)).toBe('7.1.1')
  })

  it('falls back to the first line when no version token matches', async () => {
    state.version = 'some other banner\nsecond line'
    expect(await ffmpegVersion(BIN)).toBe('some other banner')
  })

  it('returns null when the binary fails to run', async () => {
    state.execFails = true
    expect(await ffmpegVersion(BIN)).toBeNull()
  })
})

describe('ffmpegStatus', () => {
  it('reports not installed when the file is missing', async () => {
    state.exists = false
    const status = await ffmpegStatus()
    expect(status.installed).toBe(false)
    expect(status.path).toBeNull()
    expect(status.version).toBeNull()
  })

  it('reports installed with a version when present', async () => {
    state.exists = true
    state.version = 'ffmpeg version 7.1 Copyright'
    const status = await ffmpegStatus()
    expect(status.installed).toBe(true)
    expect(status.path).toBe(BIN)
    expect(status.version).toBe('7.1')
  })
})

describe('ensureFfmpeg', () => {
  it('short-circuits and reports complete when already installed', async () => {
    state.exists = true
    const stages: BootstrapProgress['stage'][] = []
    const status = await ensureFfmpeg((p) => stages.push(p.stage))
    expect(status.installed).toBe(true)
    expect(downloadFileMock).not.toHaveBeenCalled()
    expect(stages).toEqual(['checking', 'complete'])
  })

  it('downloads, extracts a tar.xz, relocates binaries, chmods, and completes', async () => {
    state.exists = false
    const stages: BootstrapProgress['stage'][] = []
    const status = await ensureFfmpeg((p) => stages.push(p.stage))
    expect(downloadFileMock).toHaveBeenCalledOnce()
    expect(tarXMock).toHaveBeenCalled()
    expect(renameMock).toHaveBeenCalledTimes(2)
    expect(chmodMock).toHaveBeenCalledWith(BIN, 0o755)
    expect(status.installed).toBe(true)
    expect(status.version).toBe('7.1')
    expect(stages).toEqual([
      'checking',
      'downloading',
      'extracting',
      'verifying',
      'complete'
    ])
  })

  it('uses PowerShell Expand-Archive on Windows and skips chmod', async () => {
    state.exists = false
    state.platform = 'win32'
    readdirMock.mockResolvedValue([fileEntry('ffmpeg.exe'), fileEntry('ffprobe.exe')])
    await ensureFfmpeg()
    expect(extractZipMock).not.toHaveBeenCalled()
    expect(tarXMock).not.toHaveBeenCalled()
    expect(chmodMock).not.toHaveBeenCalled()
  })

  it('fetches ffmpeg and ffprobe separately on macOS', async () => {
    state.exists = false
    state.platform = 'darwin'
    await ensureFfmpeg()
    // evermeet.cx publishes ffmpeg and ffprobe as two separate archives
    expect(downloadFileMock).toHaveBeenCalledTimes(2)
    expect(extractZipMock).toHaveBeenCalledTimes(2)
    expect(chmodMock).toHaveBeenCalledWith(BIN, 0o755)
  })

  it('throws and emits error when verification yields no version', async () => {
    state.exists = false
    state.execFails = true
    const stages: BootstrapProgress['stage'][] = []
    await expect(ensureFfmpeg((p) => stages.push(p.stage))).rejects.toThrow(
      /failed to report a version/
    )
    expect(stages).toContain('error')
  })
})

describe('updateFfmpeg', () => {
  it('removes the existing binary then re-runs ensureFfmpeg', async () => {
    state.exists = false
    const status = await updateFfmpeg()
    expect(rmMock).toHaveBeenCalledWith(BIN, { force: true })
    expect(downloadFileMock).toHaveBeenCalled()
    expect(status.version).toBe('7.1')
  })
})
