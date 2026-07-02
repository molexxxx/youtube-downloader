import { app, BrowserWindow, dialog } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { registerIPC } from './ipc'
import { createMainWindow, getMainWindow, setQuitting } from './windows'
import { registerLocalMediaProtocol, registerLocalMediaScheme } from './local-media'
import { initUpdater } from './updater'
import { initTray, destroyTray } from './tray'
import { initDownloadObserver } from './download-observer'
import { initDiscord, shutdownDiscord } from './discord'
import { applyLaunchOnStartup } from './startup'
import { getConfig } from './config'
import { applyTheme } from './theme'
import { logger } from './logger'

/** Headless launch check: boot the window, confirm it loads, then exit. */
const SMOKE_TEST = process.argv.includes('--smoke-test')

// Boot diagnostics: a packaged build that dies before the window appears used
// to exit silently. Log every fatal to userData/logs/app.log, and if no window
// exists yet, show a visible error box instead of vanishing.
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err?.stack ?? String(err))
  try {
    if (BrowserWindow.getAllWindows().length === 0) {
      dialog.showErrorBox(
        'YouTube Downloader failed to start',
        `${err?.message ?? err}\n\nDetails: %APPDATA%\\YouTube Downloader\\logs\\app.log`
      )
      app.exit(1)
    }
  } catch {
    // Headless (e.g. CI) - the log line is all we can do.
  }
})

process.on('unhandledRejection', (reason) => {
  logger.error(
    'Unhandled rejection:',
    reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)
  )
})

/** Bring the existing window to the foreground (used on a second launch). */
function focusMainWindow(): void {
  const window = getMainWindow()
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

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

// Single-instance: only one copy of the app may run on a machine (important when
// closing to the tray keeps it alive). A second launch focuses the existing
// window instead of opening a duplicate. The smoke test bypasses the lock so CI
// can boot an instance even if a stale one is somehow held.
const gotInstanceLock = SMOKE_TEST || app.requestSingleInstanceLock()

if (!gotInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', focusMainWindow)

  // Privileged schemes must be declared before the app is ready.
  registerLocalMediaScheme()

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.molex.youtube-downloader')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    applyTheme()
    registerIPC()
    registerLocalMediaProtocol()
    // Tray before window: start-minimized and close-to-tray both check that a
    // tray actually exists before they hide the window.
    initTray(getMainWindow)
    createMainWindow()
    initDownloadObserver()
    initUpdater()
    void initDiscord()
    // Keep the OS login item in sync with the saved config on every launch.
    const cfg = getConfig()
    void applyLaunchOnStartup(cfg.launchOnStartup, cfg.startMinimized)

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
    void shutdownDiscord()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
