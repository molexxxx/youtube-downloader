import { ipcMain } from 'electron'
import { IPC, type AppConfig } from '@shared/types'
import { getConfig, resetConfig, setConfig } from '../config'
import { applyTheme } from '../theme'
import { applyLaunchOnStartup } from '../startup'

export function registerConfigIPC(): void {
  ipcMain.handle(IPC.config.get, () => getConfig())
  ipcMain.handle(IPC.config.set, (_e, partial: Partial<AppConfig>) => {
    const config = setConfig(partial)
    if (partial.theme !== undefined) applyTheme(config.theme)
    if (partial.launchOnStartup !== undefined || partial.startMinimized !== undefined) {
      void applyLaunchOnStartup(config.launchOnStartup, config.startMinimized)
    }
    return config
  })
  ipcMain.handle(IPC.config.reset, () => {
    const config = resetConfig()
    applyTheme(config.theme)
    void applyLaunchOnStartup(config.launchOnStartup, config.startMinimized)
    return config
  })
}
