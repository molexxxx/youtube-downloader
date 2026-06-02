import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { IPC } from '@shared/types'

const { autoUpdater, handlers, sentMessages, windows, appMock, loggerMock } = vi.hoisted(() => {
  const sentMessages: Array<{ channel: string; payload: unknown }> = []
  const autoUpdater = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    allowDowngrade: true,
    logger: {} as unknown,
    forceDevUpdateConfig: false,
    listeners: new Map<string, (arg: unknown) => void>(),
    on(event: string, fn: (arg: unknown) => void) {
      this.listeners.set(event, fn)
      return this
    },
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn()
  }
  return {
    autoUpdater,
    handlers: new Map<string, (...a: unknown[]) => unknown>(),
    sentMessages,
    windows: [
      {
        webContents: {
          send: (channel: string, payload: unknown) => sentMessages.push({ channel, payload })
        }
      }
    ],
    appMock: { isPackaged: true },
    loggerMock: { info: vi.fn(), warn: vi.fn() }
  }
})

vi.mock('electron-updater', () => ({ default: { autoUpdater } }))
vi.mock('electron', () => ({
  app: appMock,
  BrowserWindow: { getAllWindows: () => windows },
  ipcMain: {
    handle: (channel: string, fn: (...a: unknown[]) => unknown) => handlers.set(channel, fn)
  }
}))
vi.mock('@main/config', () => ({ getConfig: () => ({ autoUpdateApp: true }) }))
vi.mock('@main/logger', () => ({ logger: loggerMock }))

import { initUpdater } from '@main/updater'

const emit = (event: string, arg?: unknown): void => autoUpdater.listeners.get(event)!(arg)

beforeEach(() => {
  vi.useFakeTimers()
  handlers.clear()
  sentMessages.length = 0
  autoUpdater.listeners.clear()
  vi.clearAllMocks()
  appMock.isPackaged = true
  autoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '2.0.0' } })
  initUpdater()
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
})

describe('initUpdater', () => {
  it('configures the auto updater from preferences', () => {
    expect(autoUpdater.autoDownload).toBe(true)
    expect(autoUpdater.autoInstallOnAppQuit).toBe(true)
    expect(autoUpdater.allowDowngrade).toBe(false)
  })

  it('forces dev update config when not packaged', () => {
    appMock.isPackaged = false
    autoUpdater.forceDevUpdateConfig = false
    initUpdater()
    expect(autoUpdater.forceDevUpdateConfig).toBe(true)
  })

  it('broadcasts checking state', () => {
    emit('checking-for-update')
    expect(sentMessages.at(-1)).toEqual({
      channel: IPC.appUpdate.onStatus,
      payload: { state: 'checking', version: null, percent: null, error: null }
    })
  })

  it('broadcasts available with version', () => {
    emit('update-available', { version: '2.0.0' })
    expect(sentMessages.at(-1)!.payload).toMatchObject({ state: 'available', version: '2.0.0' })
  })

  it('broadcasts up-to-date', () => {
    emit('update-not-available', { version: '1.0.0' })
    expect(sentMessages.at(-1)!.payload).toMatchObject({ state: 'up-to-date', version: '1.0.0' })
  })

  it('broadcasts rounded download progress preserving the known version', () => {
    emit('update-available', { version: '2.0.0' })
    emit('download-progress', { percent: 42.7 })
    expect(sentMessages.at(-1)!.payload).toMatchObject({
      state: 'downloading',
      version: '2.0.0',
      percent: 43
    })
  })

  it('broadcasts downloaded at 100 percent', () => {
    emit('update-downloaded', { version: '2.0.0' })
    expect(sentMessages.at(-1)!.payload).toMatchObject({ state: 'downloaded', percent: 100 })
  })

  it('broadcasts errors', () => {
    emit('error', new Error('boom'))
    expect(sentMessages.at(-1)!.payload).toMatchObject({ state: 'error', error: 'boom' })
  })

  it('status handler returns the last status', () => {
    emit('update-available', { version: '2.0.0' })
    const status = handlers.get(IPC.appUpdate.status)!()
    expect(status).toMatchObject({ state: 'available', version: '2.0.0' })
  })

  it('check returns the resolved version', async () => {
    const result = await handlers.get(IPC.appUpdate.check)!()
    expect(result).toEqual({ ok: true, version: '2.0.0' })
  })

  it('check reports failures and broadcasts an error', async () => {
    autoUpdater.checkForUpdates.mockRejectedValue(new Error('offline'))
    const result = await handlers.get(IPC.appUpdate.check)!()
    expect(result).toEqual({ ok: false, error: 'offline' })
    expect(sentMessages.at(-1)!.payload).toMatchObject({ state: 'error', error: 'offline' })
  })

  it('download succeeds', async () => {
    autoUpdater.downloadUpdate.mockResolvedValue(undefined)
    expect(await handlers.get(IPC.appUpdate.download)!()).toEqual({ ok: true })
  })

  it('download reports failures', async () => {
    autoUpdater.downloadUpdate.mockRejectedValue(new Error('no space'))
    expect(await handlers.get(IPC.appUpdate.download)!()).toEqual({ ok: false, error: 'no space' })
  })

  it('install quits and installs', () => {
    handlers.get(IPC.appUpdate.install)!()
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('runs a launch check after the delay', () => {
    autoUpdater.checkForUpdates.mockClear()
    autoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '2.0.0' } })
    vi.advanceTimersByTime(4000)
    expect(autoUpdater.checkForUpdates).toHaveBeenCalled()
  })
})
