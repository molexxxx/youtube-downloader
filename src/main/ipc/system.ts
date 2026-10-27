import { BrowserWindow, dialog, ipcMain, shell, app } from 'electron'
import type { MessageBoxOptions } from 'electron'
import { existsSync, readdirSync } from 'fs'
import { basename, dirname, join } from 'path'
import { IPC } from '@shared/types'
import { getConfig } from '../config'
import { logger } from '../logger'

/**
 * The file at `path`, or the one file beside it with the same `[id].ext` ending when
 * the recorded name is stale. Downloads made before yt-dlp output was forced to UTF-8
 * recorded non-ASCII characters in their names wrongly, but the bracketed id from the
 * default output template is ASCII and still identifies the file.
 */
export function locateFile(path: string): string | null {
  if (!path) return null
  if (existsSync(path)) return path
  const tail = basename(path).match(/\[[\w-]+\]\.\w+$/)?.[0]
  const dir = dirname(path)
  if (!tail || !existsSync(dir)) return null
  const matches = readdirSync(dir).filter((name) => name.endsWith(tail))
  return matches.length === 1 ? join(dir, matches[0]) : null
}

async function explainOpenFailure(
  win: BrowserWindow | null,
  path: string,
  reason: string | null
): Promise<void> {
  const options: MessageBoxOptions = {
    type: 'warning',
    message: reason ? 'Could not open this file' : 'File not found',
    detail: reason
      ? `${path}\n\n${reason}`
      : `${path}\n\nIt may have been moved, renamed or deleted.`,
    buttons: ['Show folder', 'Close'],
    defaultId: 0,
    cancelId: 1
  }
  const { response } = win
    ? await dialog.showMessageBox(win, options)
    : await dialog.showMessageBox(options)
  if (response !== 0) return
  const dir = dirname(path)
  void shell.openPath(existsSync(dir) ? dir : getConfig().downloadDir)
}

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

  ipcMain.handle(IPC.system.openPath, async (e, path: string) => {
    const found = locateFile(path)
    const error = found ? await shell.openPath(found) : 'File not found'
    if (error) {
      logger.warn('Could not open file', path, error)
      await explainOpenFailure(
        BrowserWindow.fromWebContents(e.sender),
        found ?? path,
        found ? error : null
      )
    }
    return error
  })

  ipcMain.handle(IPC.system.showItem, (_e, path: string) => {
    // Highlight the file in its folder. If the exact file is gone (e.g. an
    // intermediate that was merged/renamed), fall back to opening its parent
    // directory so the button never silently does nothing.
    const found = locateFile(path)
    if (found) {
      shell.showItemInFolder(found)
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
