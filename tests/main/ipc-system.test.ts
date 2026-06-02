import { describe, expect, it, vi, beforeEach } from 'vitest'
import { IPC } from '@shared/types'

const {
  handlers,
  fromWebContentsMock,
  shellMock,
  dialogMock,
  appMock,
  existsSyncMock,
  getConfigMock
} = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  fromWebContentsMock: vi.fn(),
  shellMock: {
    openPath: vi.fn(() => Promise.resolve('')),
    showItemInFolder: vi.fn(),
    openExternal: vi.fn(() => Promise.resolve())
  },
  dialogMock: { showOpenDialog: vi.fn() },
  appMock: { getVersion: vi.fn(() => '9.9.9') },
  existsSyncMock: vi.fn((_p: string) => true),
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
vi.mock('fs', () => ({ existsSync: existsSyncMock }))
vi.mock('@main/config', () => ({ getConfig: getConfigMock }))
vi.mock('@main/logger', () => ({ logger: { debug: vi.fn() } }))

import { registerSystemIPC } from '@main/ipc/system'

const sender = {}

beforeEach(() => {
  handlers.clear()
  vi.clearAllMocks()
  existsSyncMock.mockReturnValue(true)
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
    const win = { isMaximized: vi.fn(() => false), maximize: vi.fn(), unmaximize: vi.fn() }
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

  it('openPath delegates to shell', () => {
    handlers.get(IPC.system.openPath)!({}, '/some/file')
    expect(shellMock.openPath).toHaveBeenCalledWith('/some/file')
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
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/picked'] })
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
