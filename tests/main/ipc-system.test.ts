import { describe, expect, it, vi, beforeEach } from 'vitest'
import { join } from 'path'
import { IPC } from '@shared/types'

const {
  handlers,
  fromWebContentsMock,
  shellMock,
  dialogMock,
  appMock,
  existsSyncMock,
  readdirSyncMock,
  getConfigMock
} = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  fromWebContentsMock: vi.fn(),
  shellMock: {
    openPath: vi.fn(() => Promise.resolve('')),
    showItemInFolder: vi.fn(),
    openExternal: vi.fn(() => Promise.resolve())
  },
  dialogMock: { showOpenDialog: vi.fn(), showMessageBox: vi.fn() },
  appMock: { getVersion: vi.fn(() => '9.9.9') },
  existsSyncMock: vi.fn((_p: string) => true),
  readdirSyncMock: vi.fn((_p: string): string[] => []),
  getConfigMock: vi.fn(() => ({ downloadDir: '/downloads' }))
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }
  },
  BrowserWindow: { fromWebContents: fromWebContentsMock },
  dialog: dialogMock,
  shell: shellMock,
  app: appMock
}))
vi.mock('fs', () => ({ existsSync: existsSyncMock, readdirSync: readdirSyncMock }))
vi.mock('@main/config', () => ({ getConfig: getConfigMock }))
vi.mock('@main/logger', () => ({ logger: { debug: vi.fn(), warn: vi.fn() } }))

import { registerSystemIPC } from '@main/ipc/system'

const sender = {}

beforeEach(() => {
  handlers.clear()
  vi.clearAllMocks()
  existsSyncMock.mockReturnValue(true)
  readdirSyncMock.mockReturnValue([])
  dialogMock.showMessageBox.mockResolvedValue({ response: 1 })
  getConfigMock.mockReturnValue({ downloadDir: '/downloads' })
  registerSystemIPC()
})

describe('registerSystemIPC', () => {
  it('registers all window/system handlers', () => {
    for (const ch of [
      IPC.system.minimize,
      IPC.system.maximize,
      IPC.system.close,
      IPC.system.openPath,
      IPC.system.showItem,
      IPC.system.chooseDir,
      IPC.system.openExternal,
      IPC.system.appVersion
    ]) {
      expect(handlers.has(ch)).toBe(true)
    }
  })

  it('minimize minimizes the owning window', () => {
    const win = { minimize: vi.fn() }
    fromWebContentsMock.mockReturnValue(win)
    handlers.get(IPC.system.minimize)!({ sender })
    expect(win.minimize).toHaveBeenCalled()
  })

  it('maximize toggles between maximize and unmaximize', () => {
    const win = {
      isMaximized: vi.fn(() => false),
      maximize: vi.fn(),
      unmaximize: vi.fn()
    }
    fromWebContentsMock.mockReturnValue(win)
    handlers.get(IPC.system.maximize)!({ sender })
    expect(win.maximize).toHaveBeenCalled()

    win.isMaximized.mockReturnValue(true)
    handlers.get(IPC.system.maximize)!({ sender })
    expect(win.unmaximize).toHaveBeenCalled()
  })

  it('maximize is a no-op without a window', () => {
    fromWebContentsMock.mockReturnValue(null)
    expect(() => handlers.get(IPC.system.maximize)!({ sender })).not.toThrow()
  })

  it('close closes the owning window', () => {
    const win = { close: vi.fn() }
    fromWebContentsMock.mockReturnValue(win)
    handlers.get(IPC.system.close)!({ sender })
    expect(win.close).toHaveBeenCalled()
  })

  it('openPath delegates to shell', async () => {
    const result = await handlers.get(IPC.system.openPath)!({ sender }, '/some/file')
    expect(shellMock.openPath).toHaveBeenCalledWith('/some/file')
    expect(result).toBe('')
    expect(dialogMock.showMessageBox).not.toHaveBeenCalled()
  })

  it('openPath finds a download recorded under a mangled name by its id', async () => {
    const dir = join('/downloads')
    existsSyncMock.mockImplementation((p: string): boolean => p === dir)
    readdirSyncMock.mockReturnValue([
      'OP… (VV：Ultimatum) [2BY9zc7XE08].mp3',
      'Other [aUUSz54G6jc].mp4'
    ])
    await handlers.get(IPC.system.openPath)!(
      { sender },
      join(dir, 'OP� (VV Ultimatum) [2BY9zc7XE08].mp3')
    )
    expect(shellMock.openPath).toHaveBeenCalledWith(
      join(dir, 'OP… (VV：Ultimatum) [2BY9zc7XE08].mp3')
    )
  })

  it('openPath explains a missing file instead of doing nothing', async () => {
    const win = {}
    fromWebContentsMock.mockReturnValue(win)
    existsSyncMock.mockImplementation((p: string): boolean => p === join('/downloads'))
    dialogMock.showMessageBox.mockResolvedValue({ response: 0 })
    const result = await handlers.get(IPC.system.openPath)!(
      { sender },
      join('/downloads', 'gone [aUUSz54G6jc].mp3')
    )
    expect(result).toBe('File not found')
    expect(dialogMock.showMessageBox).toHaveBeenCalledWith(
      win,
      expect.objectContaining({ message: 'File not found' })
    )
    expect(shellMock.openPath).toHaveBeenCalledWith(join('/downloads'))
  })

  it('openPath shows the reason when the file exists but cannot be opened', async () => {
    fromWebContentsMock.mockReturnValue(null)
    shellMock.openPath.mockResolvedValueOnce('No application is associated')
    const result = await handlers.get(IPC.system.openPath)!({ sender }, '/some/file.xyz')
    expect(result).toBe('No application is associated')
    expect(dialogMock.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Could not open this file',
        detail: expect.stringContaining('No application is associated')
      })
    )
    expect(shellMock.openPath).toHaveBeenCalledTimes(1)
  })

  it('showItem highlights a download recorded under a mangled name', () => {
    const dir = join('/downloads')
    existsSyncMock.mockImplementation((p: string): boolean => p === dir)
    readdirSyncMock.mockReturnValue(['OP… [2BY9zc7XE08].mp3'])
    handlers.get(IPC.system.showItem)!({}, join(dir, 'OP� [2BY9zc7XE08].mp3'))
    expect(shellMock.showItemInFolder).toHaveBeenCalledWith(
      join(dir, 'OP… [2BY9zc7XE08].mp3')
    )
  })

  it('showItem highlights an existing file', () => {
    existsSyncMock.mockReturnValue(true)
    handlers.get(IPC.system.showItem)!({}, '/downloads/video.mp4')
    expect(shellMock.showItemInFolder).toHaveBeenCalledWith('/downloads/video.mp4')
  })

  it('showItem falls back to the parent directory when the file is gone', () => {
    existsSyncMock.mockImplementation((p: string): boolean => p === '/downloads')
    handlers.get(IPC.system.showItem)!({}, '/downloads/missing.mp4')
    expect(shellMock.showItemInFolder).not.toHaveBeenCalled()
    expect(shellMock.openPath).toHaveBeenCalledWith('/downloads')
  })

  it('showItem falls back to the configured download dir when no path is given', () => {
    existsSyncMock.mockReturnValue(false)
    handlers.get(IPC.system.showItem)!({}, '')
    expect(shellMock.openPath).toHaveBeenCalledWith('/downloads')
  })

  it('chooseDir returns the selected directory', async () => {
    fromWebContentsMock.mockReturnValue({})
    dialogMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/picked']
    })
    const result = await handlers.get(IPC.system.chooseDir)!({ sender })
    expect(result).toBe('/picked')
  })

  it('chooseDir returns null when cancelled', async () => {
    fromWebContentsMock.mockReturnValue({})
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    const result = await handlers.get(IPC.system.chooseDir)!({ sender })
    expect(result).toBeNull()
  })

  it('openExternal only opens http(s) urls', () => {
    handlers.get(IPC.system.openExternal)!({}, 'https://example.com')
    expect(shellMock.openExternal).toHaveBeenCalledWith('https://example.com')

    shellMock.openExternal.mockClear()
    handlers.get(IPC.system.openExternal)!({}, 'file:///etc/passwd')
    expect(shellMock.openExternal).not.toHaveBeenCalled()
  })

  it('appVersion returns the app version', () => {
    expect(handlers.get(IPC.system.appVersion)!({})).toBe('9.9.9')
  })
})
