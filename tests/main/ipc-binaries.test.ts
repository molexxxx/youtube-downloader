import { describe, expect, it, vi, beforeEach } from 'vitest'
import { IPC } from '@shared/types'

const {
  handlers,
  ytdlpStatusMock,
  ffmpegStatusMock,
  ensureYtdlpMock,
  ensureFfmpegMock,
  updateYtdlpMock,
  updateFfmpegMock
} = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  ytdlpStatusMock: vi.fn(() => Promise.resolve({ name: 'yt-dlp', installed: true })),
  ffmpegStatusMock: vi.fn(() => Promise.resolve({ name: 'ffmpeg', installed: true })),
  ensureYtdlpMock: vi.fn(() => Promise.resolve({ name: 'yt-dlp', installed: true })),
  ensureFfmpegMock: vi.fn(() => Promise.resolve({ name: 'ffmpeg', installed: true })),
  updateYtdlpMock: vi.fn(() => Promise.resolve({ name: 'yt-dlp', version: '2' })),
  updateFfmpegMock: vi.fn(() => Promise.resolve({ name: 'ffmpeg', version: '7' }))
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }
  },
  BrowserWindow: { getAllWindows: () => [] }
}))
vi.mock('@main/binaries/ytdlp-binary', () => ({
  ytdlpStatus: ytdlpStatusMock,
  ensureYtdlp: ensureYtdlpMock,
  updateYtdlp: updateYtdlpMock
}))
vi.mock('@main/binaries/ffmpeg-binary', () => ({
  ffmpegStatus: ffmpegStatusMock,
  ensureFfmpeg: ensureFfmpegMock,
  updateFfmpeg: updateFfmpegMock
}))

import { registerBinariesIPC } from '@main/ipc/binaries'

beforeEach(() => {
  handlers.clear()
  ytdlpStatusMock.mockClear()
  ffmpegStatusMock.mockClear()
  ensureYtdlpMock.mockClear()
  ensureFfmpegMock.mockClear()
  updateYtdlpMock.mockClear()
  updateFfmpegMock.mockClear()
  registerBinariesIPC()
})

describe('registerBinariesIPC', () => {
  it('registers status, bootstrap, and update handlers', () => {
    expect(handlers.has(IPC.binaries.status)).toBe(true)
    expect(handlers.has(IPC.binaries.bootstrap)).toBe(true)
    expect(handlers.has(IPC.binaries.update)).toBe(true)
  })

  it('status returns both binary statuses', async () => {
    const result = await handlers.get(IPC.binaries.status)!()
    expect(result).toEqual({
      ytdlp: { name: 'yt-dlp', installed: true },
      ffmpeg: { name: 'ffmpeg', installed: true }
    })
  })

  it('bootstrap ensures both binaries and is shared in-flight', async () => {
    const [a, b] = await Promise.all([
      handlers.get(IPC.binaries.bootstrap)!(),
      handlers.get(IPC.binaries.bootstrap)!()
    ])
    expect(a).toBe(b)
    expect(ensureYtdlpMock).toHaveBeenCalledTimes(1)
    expect(ensureFfmpegMock).toHaveBeenCalledTimes(1)
  })

  it('update yt-dlp only updates yt-dlp', async () => {
    const result = await handlers.get(IPC.binaries.update)!({}, 'yt-dlp')
    expect(updateYtdlpMock).toHaveBeenCalled()
    expect(updateFfmpegMock).not.toHaveBeenCalled()
    expect(result).toEqual({ ytdlp: { name: 'yt-dlp', version: '2' } })
  })

  it('update ffmpeg only updates ffmpeg', async () => {
    const result = await handlers.get(IPC.binaries.update)!({}, 'ffmpeg')
    expect(updateFfmpegMock).toHaveBeenCalled()
    expect(updateYtdlpMock).not.toHaveBeenCalled()
    expect(result).toEqual({ ffmpeg: { name: 'ffmpeg', version: '7' } })
  })

  it('update all updates both binaries', async () => {
    const result = await handlers.get(IPC.binaries.update)!({}, 'all')
    expect(updateYtdlpMock).toHaveBeenCalled()
    expect(updateFfmpegMock).toHaveBeenCalled()
    expect(result).toEqual({
      ytdlp: { name: 'yt-dlp', version: '2' },
      ffmpeg: { name: 'ffmpeg', version: '7' }
    })
  })
})
