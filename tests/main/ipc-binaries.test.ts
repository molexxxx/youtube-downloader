import { describe, expect, it, vi, beforeEach } from 'vitest'
import { IPC, type BinariesStatus } from '@shared/types'

const { handlers, sent, status, mocks } = vi.hoisted(() => {
  const status = {
    ytdlp: { installed: true, version: '2026.10.26' },
    ffmpeg: { installed: true, version: '9.0.2' }
  } as unknown as BinariesStatus
  let listener: ((s: BinariesStatus) => void) | null = null
  return {
    handlers: new Map<string, (...args: unknown[]) => unknown>(),
    sent: [] as Array<[string, unknown]>,
    status,
    mocks: {
      binariesStatus: vi.fn(async () => status),
      bootstrapBinaries: vi.fn(async () => status),
      check: vi.fn(async () => status.ytdlp),
      scanBinaries: vi.fn(async () => ({
        ytdlp: null,
        ffmpeg: null,
        ytdlpRelease: null
      })),
      runSelfTest: vi.fn(async () => null),
      onBinariesStatus: vi.fn((fn: (s: BinariesStatus) => void) => {
        listener = fn
        return () => undefined
      }),
      emit: (s: BinariesStatus) => listener?.(s)
    }
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }
  },
  BrowserWindow: {
    getAllWindows: () => [
      {
        webContents: {
          send: (channel: string, payload: unknown) => sent.push([channel, payload])
        }
      }
    ]
  }
}))
vi.mock('@main/binaries', () => ({
  binariesStatus: mocks.binariesStatus,
  bootstrapBinaries: mocks.bootstrapBinaries,
  onBinariesStatus: mocks.onBinariesStatus,
  scanBinaries: mocks.scanBinaries,
  runSelfTest: mocks.runSelfTest,
  ytdlpUpdater: () => ({ check: mocks.check })
}))

import { registerBinariesIPC } from '@main/ipc/binaries'

beforeEach(() => {
  handlers.clear()
  sent.length = 0
  vi.clearAllMocks()
  registerBinariesIPC()
})

describe('registerBinariesIPC', () => {
  it('registers the status, bootstrap, and yt-dlp check handlers', () => {
    expect([...handlers.keys()].sort()).toEqual(
      [
        IPC.binaries.status,
        IPC.binaries.bootstrap,
        IPC.binaries.checkYtdlp,
        IPC.binaries.scan,
        IPC.binaries.selfTest
      ].sort()
    )
  })

  it('answers the status and the bootstrap with the whole status', async () => {
    await expect(handlers.get(IPC.binaries.status)!()).resolves.toBe(status)
    await expect(handlers.get(IPC.binaries.bootstrap)!()).resolves.toBe(status)
    expect(mocks.bootstrapBinaries).toHaveBeenCalledTimes(1)
  })

  it('checks yt-dlp, installing a newer release, then answers the whole status', async () => {
    await expect(handlers.get(IPC.binaries.checkYtdlp)!()).resolves.toBe(status)
    expect(mocks.check).toHaveBeenCalledWith()
    expect(mocks.binariesStatus).toHaveBeenCalled()
  })

  it('scans this computer, and self-tests only a known binary', async () => {
    await expect(handlers.get(IPC.binaries.scan)!()).resolves.toEqual({
      ytdlp: null,
      ffmpeg: null,
      ytdlpRelease: null
    })
    await expect(handlers.get(IPC.binaries.selfTest)!({}, 'ffmpeg')).resolves.toBe(status)
    expect(mocks.runSelfTest).toHaveBeenCalledWith('ffmpeg')
    await expect(handlers.get(IPC.binaries.selfTest)!({}, 'rm -rf')).rejects.toThrow(
      'Unknown binary to self-test'
    )
  })

  it('pushes every status change to the windows', () => {
    mocks.emit(status)
    expect(sent).toEqual([[IPC.binaries.onStatus, status]])
  })
})
