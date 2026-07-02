import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC } from '@shared/types'
import { AUDIO_EXTENSIONS, importLocalAudio } from '../local-media'
import { logger } from '../logger'

export function registerLocalMediaIPC(): void {
  ipcMain.handle(IPC.localMedia.pick, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = await dialog.showOpenDialog(win!, {
      title: 'Import audio files',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio files', extensions: AUDIO_EXTENSIONS }]
    })
    return result.canceled ? [] : importLocalAudio(result.filePaths)
  })

  ipcMain.handle(IPC.localMedia.register, (_e, paths: string[]) =>
    importLocalAudio(Array.isArray(paths) ? paths : [])
  )

  logger.debug('Local media IPC registered')
}
