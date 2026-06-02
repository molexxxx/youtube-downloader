import { BrowserWindow, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getConfig } from './config'

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
  const window = new BrowserWindow({
    width: 1240,
    height: 880,
    minWidth: 980,
    minHeight: 700,
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

  mainWindow = window
  window.on('closed', () => {
    mainWindow = null
  })

  window.on('close', (event) => {
    // Keep running in the tray when the user closes the window, unless we are
    // actually quitting (tray "Quit", app.quit(), or platform shutdown).
    if (!quitting && getConfig().closeToTray) {
      event.preventDefault()
      window.hide()
    }
  })

  window.on('ready-to-show', () => window.show())

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
