import { BrowserWindow, dialog, ipcMain, shell, app } from 'electron'
import { existsSync } from 'fs'
import { dirname } from 'path'
import { IPC } from '@shared/types'
import { getConfig } from '../config'
import { logger } from '../logger'

export function registerSystemIPC(): void {
  ipcMain.handle(IPC.system.minimize, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })

  ipcMain.handle(IPC.system.maximize, (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.handle(IPC.system.close, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })

  ipcMain.handle(IPC.system.openPath, (_e, path: string) => shell.openPath(path))

  ipcMain.handle(IPC.system.showItem, (_e, path: string) => {
    // Highlight the file in its folder. If the exact file is gone (e.g. an
    // intermediate that was merged/renamed), fall back to opening its parent
    // directory so the button never silently does nothing.
    if (path && existsSync(path)) {
      shell.showItemInFolder(path)
      return
    }
    const dir = path ? dirname(path) : getConfig().downloadDir
    void shell.openPath(existsSync(dir) ? dir : getConfig().downloadDir)
  })

  ipcMain.handle(IPC.system.chooseDir, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(IPC.system.openExternal, (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  ipcMain.handle(IPC.system.appVersion, () => app.getVersion())

  logger.debug('System IPC registered')
}
