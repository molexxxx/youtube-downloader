import { describe, expect, it, vi, beforeEach } from 'vitest'

const { instances, BrowserWindowMock, MenuMock, shellMock, getConfigMock, isObj, popupMock } =
  vi.hoisted(() => {
    interface WC {
      handlers: Map<string, (...a: unknown[]) => void>
      openHandler?: (d: unknown) => unknown
      setWindowOpenHandler: ReturnType<typeof vi.fn>
      on: ReturnType<typeof vi.fn>
    }
    interface MW {
      options: Record<string, unknown>
      handlers: Map<string, (...a: unknown[]) => void>
      webContents: WC
      show: ReturnType<typeof vi.fn>
      hide: ReturnType<typeof vi.fn>
      loadURL: ReturnType<typeof vi.fn>
      loadFile: ReturnType<typeof vi.fn>
      on: ReturnType<typeof vi.fn>
    }
    const instances: MW[] = []
    const popupMock = vi.fn()
    class BrowserWindowMock {
      options: Record<string, unknown>
      handlers = new Map<string, (...a: unknown[]) => void>()
      webContents: WC
      show = vi.fn()
      hide = vi.fn()
      loadURL = vi.fn()
      loadFile = vi.fn()
      on: ReturnType<typeof vi.fn>
      constructor(options: Record<string, unknown>) {
        this.options = options
        const wc: WC = {
          handlers: new Map(),
          setWindowOpenHandler: vi.fn((fn: (d: unknown) => unknown) => {
            wc.openHandler = fn
          }),
          on: vi.fn((event: string, cb: (...a: unknown[]) => void) => {
            wc.handlers.set(event, cb)
          })
        }
        this.webContents = wc
        this.on = vi.fn((event: string, cb: (...a: unknown[]) => void) => {
          this.handlers.set(event, cb)
        })
        instances.push(this as unknown as MW)
      }
    }
    return {
      instances,
      BrowserWindowMock,
      MenuMock: { buildFromTemplate: vi.fn(() => ({ popup: popupMock })) },
      shellMock: { openExternal: vi.fn() },
      getConfigMock: vi.fn(() => ({ closeToTray: true })),
      isObj: { dev: false },
      popupMock
    }
  })

vi.mock('electron', () => ({
  BrowserWindow: BrowserWindowMock,
  Menu: MenuMock,
  shell: shellMock
}))
vi.mock('@electron-toolkit/utils', () => ({ is: isObj }))
vi.mock('@main/config', () => ({ getConfig: getConfigMock }))

import { createMainWindow, getMainWindow, setQuitting } from '@main/windows'

beforeEach(() => {
  instances.length = 0
  vi.clearAllMocks()
  isObj.dev = false
  getConfigMock.mockReturnValue({ closeToTray: true })
  delete (process.env as Record<string, string | undefined>)['ELECTRON_RENDERER_URL']
  setQuitting(false)
})

describe('createMainWindow', () => {
  it('creates a window with the expected dimensions and exposes it', () => {
    const win = createMainWindow()
    expect(getMainWindow()).toBe(win)
    expect(instances[0].options).toMatchObject({ width: 1240, height: 880, frame: false })
  })

  it('loads the renderer file in production', () => {
    createMainWindow()
    expect(instances[0].loadFile).toHaveBeenCalled()
    expect(instances[0].loadURL).not.toHaveBeenCalled()
  })

  it('loads the dev server URL when available', () => {
    isObj.dev = true
    ;(process.env as Record<string, string | undefined>)['ELECTRON_RENDERER_URL'] =
      'http://localhost:5173'
    createMainWindow()
    expect(instances[0].loadURL).toHaveBeenCalledWith('http://localhost:5173')
  })

  it('clears the reference when closed', () => {
    createMainWindow()
    instances[0].handlers.get('closed')!()
    expect(getMainWindow()).toBeNull()
  })

  it('shows the window when ready-to-show fires', () => {
    createMainWindow()
    instances[0].handlers.get('ready-to-show')!()
    expect(instances[0].show).toHaveBeenCalled()
  })

  it('hides instead of closing when closeToTray is on', () => {
    createMainWindow()
    const event = { preventDefault: vi.fn() }
    instances[0].handlers.get('close')!(event)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(instances[0].hide).toHaveBeenCalled()
  })

  it('allows closing when quitting', () => {
    createMainWindow()
    setQuitting(true)
    const event = { preventDefault: vi.fn() }
    instances[0].handlers.get('close')!(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('allows closing when closeToTray is off', () => {
    getConfigMock.mockReturnValue({ closeToTray: false })
    createMainWindow()
    const event = { preventDefault: vi.fn() }
    instances[0].handlers.get('close')!(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('opens external links in the browser and denies new windows', () => {
    createMainWindow()
    const result = instances[0].webContents.openHandler!({ url: 'https://x.com' })
    expect(shellMock.openExternal).toHaveBeenCalledWith('https://x.com')
    expect(result).toEqual({ action: 'deny' })
  })

  it('builds an editable context menu for input fields', () => {
    createMainWindow()
    const handler = instances[0].webContents.handlers.get('context-menu')!
    handler(
      {},
      {
        isEditable: true,
        editFlags: { canCut: true, canCopy: true, canPaste: true },
        selectionText: ''
      }
    )
    expect(MenuMock.buildFromTemplate).toHaveBeenCalled()
    expect(popupMock).toHaveBeenCalled()
  })

  it('builds a copy-only menu for selected text', () => {
    createMainWindow()
    const handler = instances[0].webContents.handlers.get('context-menu')!
    handler({}, { isEditable: false, editFlags: { canCopy: true }, selectionText: 'hello' })
    expect(popupMock).toHaveBeenCalled()
  })

  it('shows no menu when not editable and nothing is selected', () => {
    createMainWindow()
    const handler = instances[0].webContents.handlers.get('context-menu')!
    handler({}, { isEditable: false, editFlags: {}, selectionText: '   ' })
    expect(popupMock).not.toHaveBeenCalled()
  })
})
