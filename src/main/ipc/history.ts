import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '@shared/types'
import { clearHistory, getHistory, removeHistory, subscribeHistory } from '../history'

export function registerHistoryIPC(): void {
  ipcMain.handle(IPC.history.list, () => getHistory())
  ipcMain.handle(IPC.history.remove, (_e, id: string) => removeHistory(id))
  ipcMain.handle(IPC.history.clear, () => clearHistory())

  subscribeHistory((entries) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.history.onChange, entries)
    }
  })
}
