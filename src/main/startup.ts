import { app } from 'electron'
import { existsSync } from 'fs'
import { mkdir, unlink, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { logger } from './logger'

/** Arg passed to a login-launched instance so it can start hidden in the tray. */
export const HIDDEN_LAUNCH_ARG = '--hidden'

const LINUX_AUTOSTART_DIR = join(homedir(), '.config', 'autostart')
const LINUX_DESKTOP_FILE = join(LINUX_AUTOSTART_DIR, 'youtube-downloader.desktop')

/**
 * Register (or clear) the OS "launch at login" entry. Windows/macOS use Electron's
 * native login-item API; Linux has no such API, so we write a freedesktop
 * autostart .desktop file instead.
 */
export async function applyLaunchOnStartup(
  enabled: boolean,
  startMinimized: boolean
): Promise<void> {
  if (process.platform === 'linux') {
    await applyLinuxAutostart(enabled, startMinimized)
    return
  }
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: startMinimized,
      args: startMinimized ? [HIDDEN_LAUNCH_ARG] : []
    })
  } catch (err) {
    logger.warn('Failed to update login item settings:', err)
  }
}

async function applyLinuxAutostart(
  enabled: boolean,
  startMinimized: boolean
): Promise<void> {
  try {
    if (!enabled) {
      await unlink(LINUX_DESKTOP_FILE).catch(() => {})
      return
    }
    await mkdir(LINUX_AUTOSTART_DIR, { recursive: true })
    const exec = `${process.execPath}${startMinimized ? ` ${HIDDEN_LAUNCH_ARG}` : ''}`
    const content = [
      '[Desktop Entry]',
      'Type=Application',
      'Name=YouTube Downloader',
      `Exec=${exec}`,
      'X-GNOME-Autostart-enabled=true',
      'Terminal=false',
      ''
    ].join('\n')
    await writeFile(LINUX_DESKTOP_FILE, content, 'utf8')
  } catch (err) {
    logger.warn('Failed to update Linux autostart entry:', err)
  }
}

/** Whether the OS is currently set to launch the app at login. */
export function isLaunchOnStartupEnabled(): boolean {
  if (process.platform === 'linux') return existsSync(LINUX_DESKTOP_FILE)
  return app.getLoginItemSettings().openAtLogin
}

/** True when this instance was started by the login item and should stay hidden. */
export function launchedHidden(): boolean {
  if (process.argv.includes(HIDDEN_LAUNCH_ARG)) return true
  return process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAsHidden
}
