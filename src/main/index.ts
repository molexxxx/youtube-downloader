import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { registerIPC } from './ipc'
import { createMainWindow, getMainWindow, setQuitting } from './windows'
import { initUpdater } from './updater'
import { initTray, destroyTray } from './tray'
import { initDownloadObserver } from './download-observer'
import { applyTheme } from './theme'
import { logger } from './logger'

/** Headless launch check: boot the window, confirm it loads, then exit. */
const SMOKE_TEST = process.argv.includes('--smoke-test')

function runSmokeTest(): void {
  const window = getMainWindow()
  if (!window) {
    logger.error('Smoke test failed: no main window')
    app.exit(1)
    return
  }
  const timeout = setTimeout(() => {
    logger.error('Smoke test failed: window did not finish loading in time')
    app.exit(1)
  }, 30_000)
  window.webContents.once('did-finish-load', () => {
    clearTimeout(timeout)
    logger.info('Smoke test passed: window loaded')
    app.exit(0)
  })
  window.webContents.once('did-fail-load', (_e, code, desc) => {
    clearTimeout(timeout)
    logger.error('Smoke test failed: did-fail-load', code, desc)
    app.exit(1)
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.molex.youtube-downloader')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  applyTheme()
  registerIPC()
  createMainWindow()
  initTray(getMainWindow)
  initDownloadObserver()
  initUpdater()

  logger.info('YouTube Downloader started, version', app.getVersion())

  if (SMOKE_TEST) {
    runSmokeTest()
    return
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('before-quit', () => {
  setQuitting(true)
  destroyTray()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
