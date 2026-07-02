import { ipcMain } from 'electron'
import { IPC, type MiniWindowSize } from '@shared/types'
import {
  MINI_WINDOW_SIZES,
  createMainWindow,
  getMainWindow,
  getMiniWindow,
  openMiniWindow
} from '../windows'
import { logger } from '../logger'

export function registerMiniIPC(): void {
  ipcMain.handle(IPC.mini.open, () => {
    openMiniWindow()
  })

  ipcMain.handle(IPC.mini.close, () => {
    getMiniWindow()?.close()
  })

  ipcMain.handle(IPC.mini.setSize, (_e, size: MiniWindowSize) => {
    const win = getMiniWindow()
    const dims = MINI_WINDOW_SIZES[size]
    if (!win || !dims) return
    // Resize in place, keeping the top-right corner anchored so a window pinned
    // to a screen edge grows toward free space instead of off-screen.
    const bounds = win.getBounds()
    win.setBounds({
      x: bounds.x + bounds.width - dims.width,
      y: bounds.y,
      width: dims.width,
      height: dims.height
    })
  })

  ipcMain.handle(IPC.mini.setPinned, (_e, pinned: boolean) => {
    const win = getMiniWindow()
    if (!win) return false
    win.setAlwaysOnTop(pinned, 'floating')
    return win.isAlwaysOnTop()
  })

  ipcMain.handle(IPC.mini.focusMain, () => {
    let win = getMainWindow()
    if (!win || win.isDestroyed()) {
      // Main window was fully closed (no tray): recreate it on demand.
      win = createMainWindow()
    }
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })

  logger.debug('Mini window IPC registered')
}
