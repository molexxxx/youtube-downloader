import { describe, expect, it, vi, beforeEach } from 'vitest'
import { join } from 'path'
import type { BootstrapProgress } from '@shared/types'

const { state, downloadFileMock, ensureBinDirMock, chmodMock, statMock } = vi.hoisted(
  () => ({
    state: {
      exists: false,
      version: 'v1',
      execFails: false,
      platform: 'linux' as string
    },
    downloadFileMock: vi.fn(
      (
        _url: string,
        _dest: string,
        onProgress?: (d: number, t: number | null) => void
      ) => {
        onProgress?.(512, 1024)
        return Promise.resolve()
      }
    ),
    ensureBinDirMock: vi.fn(() => Promise.resolve('/userdata/bin')),
    chmodMock: vi.fn(() => Promise.resolve()),
    statMock: vi.fn()
  })
)

vi.mock('@main/binaries/net', () => ({
  binDir: () => '/userdata/bin',
  ensureBinDir: ensureBinDirMock,
  downloadFile: downloadFileMock,
  currentPlatform: () => state.platform
}))
vi.mock('fs/promises', () => ({
  chmod: chmodMock,
  stat: (...args: unknown[]) => statMock(...args)
}))
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
  ytdlpPath,
  ytdlpStatus,
  ensureYtdlp,
  updateYtdlp
} from '@main/binaries/ytdlp-binary'

const BIN = join('/userdata/bin', 'yt-dlp')

beforeEach(() => {
  state.exists = false
  state.version = 'v1'
  state.execFails = false
  state.platform = 'linux'
  downloadFileMock.mockClear()
  ensureBinDirMock.mockClear()
  chmodMock.mockClear()
  statMock.mockReset()
  statMock.mockImplementation(() => {
    if (state.exists) return Promise.resolve({})
    return Promise.reject(new Error('missing'))
  })
})

describe('ytdlpPath', () => {
  it('returns the platform asset under the bin dir', () => {
    expect(ytdlpPath()).toBe(BIN)
  })
})

describe('ytdlpStatus', () => {
  it('reports not installed when the file is missing', async () => {
    state.exists = false
    const status = await ytdlpStatus()
    expect(status.installed).toBe(false)
    expect(status.path).toBeNull()
    expect(status.version).toBeNull()
  })

  it('reports installed with a version when present', async () => {
    state.exists = true
    state.version = '2026.01.01'
    const status = await ytdlpStatus()
    expect(status.installed).toBe(true)
    expect(status.path).toBe(BIN)
    expect(status.version).toBe('2026.01.01')
  })
})

describe('ensureYtdlp', () => {
  it('short-circuits and reports complete when already installed', async () => {
    state.exists = true
    const stages: BootstrapProgress['stage'][] = []
    const status = await ensureYtdlp((p) => stages.push(p.stage))
    expect(status.installed).toBe(true)
    expect(downloadFileMock).not.toHaveBeenCalled()
    expect(stages).toContain('complete')
  })

  it('downloads, chmods (non-win), verifies, and completes', async () => {
    state.exists = false
    state.version = '2026.02.02'
    const stages: BootstrapProgress['stage'][] = []
    const status = await ensureYtdlp((p) => stages.push(p.stage))
    expect(downloadFileMock).toHaveBeenCalledOnce()
    expect(chmodMock).toHaveBeenCalledWith(BIN, 0o755)
    expect(status.version).toBe('2026.02.02')
    expect(stages).toEqual(['checking', 'downloading', 'verifying', 'complete'])
  })

  it('does not chmod on Windows', async () => {
    state.exists = false
    state.platform = 'win32'
    await ensureYtdlp()
    expect(chmodMock).not.toHaveBeenCalled()
  })

  it('throws and emits error when verification yields no version', async () => {
    state.exists = false
    state.execFails = true
    const stages: BootstrapProgress['stage'][] = []
    await expect(ensureYtdlp((p) => stages.push(p.stage))).rejects.toThrow(
      /failed to report a version/
    )
    expect(stages).toContain('error')
  })
})

describe('updateYtdlp', () => {
  it('falls back to ensureYtdlp when the binary is missing', async () => {
    state.exists = false
    state.version = '2026.03.03'
    const status = await updateYtdlp()
    expect(downloadFileMock).toHaveBeenCalled()
    expect(status.version).toBe('2026.03.03')
  })

  it('runs the self-updater and reports status when installed', async () => {
    state.exists = true
    state.version = '2026.04.04'
    const status = await updateYtdlp()
    expect(status.installed).toBe(true)
    expect(status.version).toBe('2026.04.04')
  })

  it('re-downloads when the self-updater fails', async () => {
    state.exists = true
    state.execFails = true
    await updateYtdlp()
    expect(downloadFileMock).toHaveBeenCalled()
  })
})
