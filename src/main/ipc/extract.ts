import { ipcMain } from 'electron'
import { IPC } from '@shared/types'
import { getInfo, search } from '../ytdlp/resolver'
import { cleanErrorMessage } from '../errors'
import { logger } from '../logger'

export function registerExtractIPC(): void {
  ipcMain.handle(IPC.extract.info, async (_e, url: string, forcePlaylist?: boolean) => {
    try {
      return await getInfo(url, forcePlaylist)
    } catch (err) {
      const message = cleanErrorMessage(err)
      logger.error('extract.info failed:', message)
      throw new Error(message)
    }
  })

  ipcMain.handle(IPC.extract.search, async (_e, query: string, limit?: number) => {
    try {
      return await search(query, limit)
    } catch (err) {
      const message = cleanErrorMessage(err)
      logger.error('extract.search failed:', message)
      throw new Error(message)
    }
  })
}
