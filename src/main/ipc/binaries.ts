import { BrowserWindow, ipcMain } from 'electron'
import { IPC, type BinariesStatus } from '@shared/types'
import {
  binariesStatus,
  bootstrapBinaries,
  onBinariesStatus,
  runSelfTest,
  scanBinaries,
  ytdlpUpdater
} from '../binaries'

function broadcast(status: BinariesStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.binaries.onStatus, status)
  }
}

export function registerBinariesIPC(): void {
  ipcMain.handle(IPC.binaries.status, () => binariesStatus())
  ipcMain.handle(IPC.binaries.bootstrap, () => bootstrapBinaries())
  ipcMain.handle(IPC.binaries.checkYtdlp, async () => {
    await ytdlpUpdater().check()
    return binariesStatus()
  })
  ipcMain.handle(IPC.binaries.scan, () => scanBinaries())
  ipcMain.handle(IPC.binaries.selfTest, async (_e, which: unknown) => {
    if (which !== 'ytdlp' && which !== 'ffmpeg') {
      throw new Error(`Unknown binary to self-test: ${String(which)}`)
    }
    await runSelfTest(which)
    return binariesStatus()
  })
  onBinariesStatus(broadcast)
}
