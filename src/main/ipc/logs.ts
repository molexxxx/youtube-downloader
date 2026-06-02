import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '@shared/types'
import { logger } from '../logger'

export function registerLogsIPC(): void {
  ipcMain.handle(IPC.logs.list, () => logger.history())

  logger.subscribe((entry) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.logs.onEntry, entry)
    }
  })
}
