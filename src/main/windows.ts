import { BrowserWindow, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getConfig } from './config'
import { launchedHidden } from './startup'
import { hasTray } from './tray'
import {
  DEFAULT_WINDOW_SIZE,
  MIN_WINDOW_SIZE,
  loadWindowState,
  trackWindowState
} from './window-state'

let mainWindow: BrowserWindow | null = null
let quitting = false

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

/** Marks that the app is genuinely quitting so the close-to-tray guard stops hiding. */
export function setQuitting(value: boolean): void {
  quitting = value
}

export function createMainWindow(): BrowserWindow {
  const state = loadWindowState()
  const window = new BrowserWindow({
    width: state.bounds?.width ?? DEFAULT_WINDOW_SIZE.width,
    height: state.bounds?.height ?? DEFAULT_WINDOW_SIZE.height,
    x: state.bounds?.x,
    y: state.bounds?.y,
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    icon: join(__dirname, '../../resources/icon.png'),
    titleBarStyle: 'hidden',
    backgroundColor: '#0b0d12',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (state.maximized) window.maximize()
  trackWindowState(window)

  mainWindow = window
  window.on('closed', () => {
    mainWindow = null
  })

  window.on('close', (event) => {
    // Keep running in the tray when the user closes the window, unless we are
    // actually quitting (tray "Quit", app.quit(), or platform shutdown). Never
    // hide when no tray exists - there would be no way to bring the app back.
    if (!quitting && getConfig().closeToTray && hasTray()) {
      event.preventDefault()
      window.hide()
    }
  })

  // Launched at login with "start minimized": stay hidden in the tray instead of
  // popping the window. Falls back to visible when the tray is unavailable.
  const startHidden = launchedHidden() && getConfig().startMinimized && hasTray()
  window.on('ready-to-show', () => {
    if (!startHidden) window.show()
  })

  // Safety net for packaged builds: if the renderer never reaches ready-to-show
  // (broken packaging, GPU issues), surface the window anyway so the failure is
  // visible instead of a silent background process.
  const showFallback = setTimeout(() => {
    if (!window.isDestroyed() && !window.isVisible() && !startHidden) {
      window.show()
    }
  }, 10_000)
  window.once('closed', () => clearTimeout(showFallback))

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Native right-click editing menu for inputs and selectable text.
  window.webContents.on('context-menu', (_event, params) => {
    const { isEditable, editFlags, selectionText } = params
    const hasSelection = selectionText.trim().length > 0
    if (!isEditable && !hasSelection) return

    const template: MenuItemConstructorOptions[] = isEditable
      ? [
          { role: 'undo', enabled: editFlags.canUndo },
          { role: 'redo', enabled: editFlags.canRedo },
          { type: 'separator' },
          { role: 'cut', enabled: editFlags.canCut },
          { role: 'copy', enabled: editFlags.canCopy },
          { role: 'paste', enabled: editFlags.canPaste },
          { type: 'separator' },
          { role: 'selectAll', enabled: editFlags.canSelectAll }
        ]
      : [{ role: 'copy', enabled: editFlags.canCopy }]

    Menu.buildFromTemplate(template).popup({ window })
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}
