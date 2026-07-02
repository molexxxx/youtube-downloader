import {
  BrowserWindow,
  Menu,
  screen,
  shell,
  type MenuItemConstructorOptions
} from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type { MiniWindowSize } from '@shared/types'
import { getConfig } from './config'
import { launchedHidden } from './startup'
import { hasTray } from './tray'
import {
  DEFAULT_MINI_WINDOW_SIZE,
  DEFAULT_WINDOW_SIZE,
  MIN_MINI_WINDOW_SIZE,
  MIN_WINDOW_SIZE,
  loadMiniWindowBounds,
  loadWindowState,
  trackMiniWindowState,
  trackWindowState
} from './window-state'

let mainWindow: BrowserWindow | null = null
let miniWindow: BrowserWindow | null = null
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

export function getMiniWindow(): BrowserWindow | null {
  return miniWindow
}

/** Window dimensions for each quick-actions size preset. */
export const MINI_WINDOW_SIZES: Record<
  MiniWindowSize,
  { width: number; height: number }
> = {
  compact: { width: 340, height: 440 },
  standard: DEFAULT_MINI_WINDOW_SIZE,
  tall: { width: 420, height: 680 }
}

/**
 * Open (or focus) the pinned quick-actions window: a small frameless
 * always-on-top companion with quick download and Discord bot controls.
 */
export function openMiniWindow(): BrowserWindow {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.show()
    miniWindow.focus()
    return miniWindow
  }

  const saved = loadMiniWindowBounds()
  // Default to the top-right corner of the display the main window is on.
  const display = screen.getDisplayMatching(
    mainWindow?.getBounds() ?? { x: 0, y: 0, width: 1, height: 1 }
  )
  const area = display.workArea
  const window = new BrowserWindow({
    width: saved?.width ?? DEFAULT_MINI_WINDOW_SIZE.width,
    height: saved?.height ?? DEFAULT_MINI_WINDOW_SIZE.height,
    x: saved?.x ?? area.x + area.width - DEFAULT_MINI_WINDOW_SIZE.width - 24,
    y: saved?.y ?? area.y + 24,
    minWidth: MIN_MINI_WINDOW_SIZE.width,
    minHeight: MIN_MINI_WINDOW_SIZE.height,
    show: false,
    frame: false,
    alwaysOnTop: true,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    autoHideMenuBar: true,
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

  // 'floating' keeps it above normal windows without fighting fullscreen apps.
  window.setAlwaysOnTop(true, 'floating')
  trackMiniWindowState(window)

  miniWindow = window
  window.on('closed', () => {
    miniWindow = null
  })

  window.on('ready-to-show', () => window.show())

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#mini`)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'mini' })
  }

  return window
}
