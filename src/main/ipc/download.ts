import { BrowserWindow, ipcMain } from 'electron'
import { IPC, type DownloadJob, type DownloadRequest } from '@shared/types'
import { downloadManager } from '../ytdlp/downloader'

export function registerDownloadIPC(): void {
  const manager = downloadManager()

  manager.on('update', (job: DownloadJob) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.download.onUpdate, job)
    }
  })

  ipcMain.handle(IPC.download.start, (_e, req: DownloadRequest) => manager.enqueue(req))
  ipcMain.handle(IPC.download.cancel, (_e, id: string) => manager.cancel(id))
  ipcMain.handle(IPC.download.list, () => manager.list())
}
