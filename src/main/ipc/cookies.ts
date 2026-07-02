import { ipcMain } from 'electron'
import { IPC } from '@shared/types'
import { setConfig } from '../config'
import { clearCookies, getCookieInfo, refreshCookies } from '../ytdlp/cookies'

export function registerCookiesIPC(): void {
  ipcMain.handle(IPC.cookies.info, () => getCookieInfo())

  ipcMain.handle(IPC.cookies.set, async (_e, browser: string) => {
    setConfig({ cookiesFromBrowser: browser || null })
    if (browser) return refreshCookies()
    clearCookies()
    return getCookieInfo()
  })

  ipcMain.handle(IPC.cookies.refresh, () => refreshCookies())

  ipcMain.handle(IPC.cookies.clear, () => {
    setConfig({ cookiesFromBrowser: null })
    clearCookies()
    return getCookieInfo()
  })
}
