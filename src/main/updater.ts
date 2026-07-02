import pkg from 'electron-updater'
import { app, BrowserWindow, ipcMain } from 'electron'
import { IPC, type AppUpdateStatus } from '@shared/types'
import { getConfig } from './config'
import { logger } from './logger'

const { autoUpdater } = pkg

let lastStatus: AppUpdateStatus = {
  state: 'idle',
  version: null,
  percent: null,
  error: null
}

function broadcast(status: AppUpdateStatus): void {
  lastStatus = status
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.appUpdate.onStatus, status)
  }
}

/**
 * Wire the auto-updater: forward all lifecycle events to the renderer, register
 * IPC for manual check/download/install, and run a non-intrusive check on launch.
 *
 * `autoDownload` follows the `autoUpdateApp` preference, but a check always runs
 * so the UI can surface that an update exists even when auto-download is off.
 */
export function initUpdater(): void {
  autoUpdater.autoDownload = getConfig().autoUpdateApp
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false
  autoUpdater.logger = null

  // Avoid hanging on checkForUpdates in an unpackaged dev build.
  if (!app.isPackaged) {
    autoUpdater.forceDevUpdateConfig = true
  }

  autoUpdater.on('checking-for-update', () => {
    logger.info('Checking for app updates…')
    broadcast({ state: 'checking', version: null, percent: null, error: null })
  })
  autoUpdater.on('update-available', (info) => {
    logger.info('App update available:', info.version)
    broadcast({ state: 'available', version: info.version, percent: null, error: null })
  })
  autoUpdater.on('update-not-available', (info) => {
    logger.info('App is up to date:', info.version)
    broadcast({ state: 'up-to-date', version: info.version, percent: null, error: null })
  })
  autoUpdater.on('download-progress', (progress) => {
    broadcast({
      state: 'downloading',
      version: lastStatus.version,
      percent: Math.round(progress.percent),
      error: null
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    logger.info('App update downloaded:', info.version)
    broadcast({ state: 'downloaded', version: info.version, percent: 100, error: null })
  })
  autoUpdater.on('error', (err) => {
    logger.warn('App update error:', err.message)
    broadcast({
      state: 'error',
      version: lastStatus.version,
      percent: null,
      error: err.message
    })
  })

  ipcMain.handle(IPC.appUpdate.status, () => lastStatus)

  ipcMain.handle(IPC.appUpdate.check, async () => {
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Update check timed out')), 15_000)
      )
      const result = await Promise.race([autoUpdater.checkForUpdates(), timeout])
      return { ok: true, version: result?.updateInfo?.version ?? null }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Update check failed'
      broadcast({
        state: 'error',
        version: lastStatus.version,
        percent: null,
        error: message
      })
      return { ok: false, error: message }
    }
  })

  ipcMain.handle(IPC.appUpdate.download, async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { ok: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Download failed'
      return { ok: false, error: message }
    }
  })

  ipcMain.handle(IPC.appUpdate.install, () => {
    // Silent install + relaunch: in-app updates apply in the background (NSIS
    // /S on Windows) instead of popping the interactive installer. Manual
    // downloads from GitHub still run the normal assisted installer.
    autoUpdater.quitAndInstall(true, true)
  })

  // Check on launch once the window can receive events. Never throws.
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      logger.warn('Launch update check failed:', err?.message ?? err)
    })
  }, 4_000)
}
