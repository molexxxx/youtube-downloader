import { app, Menu, Tray, nativeImage, type NativeImage } from 'electron'
import type { DownloadJob } from '@shared/types'
import trayIcon from './tray-icon.json'

let tray: Tray | null = null
let getWindow: (() => Electron.BrowserWindow | null) | null = null

function icon(): NativeImage {
  const image = nativeImage.createFromDataURL(trayIcon.dataUrl)
  return process.platform === 'darwin' ? image.resize({ width: 16, height: 16 }) : image
}

function showWindow(): void {
  const win = getWindow?.()
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function buildMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: 'Show YouTube Downloader', click: showWindow },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])
}

export function initTray(windowGetter: () => Electron.BrowserWindow | null): void {
  if (tray) return
  getWindow = windowGetter
  tray = new Tray(icon())
  tray.setToolTip('YouTube Downloader')
  tray.setContextMenu(buildMenu())
  tray.on('click', showWindow)
}

/** Reflect live download activity in the tray tooltip. */
export function updateTray(jobs: DownloadJob[]): void {
  if (!tray) return
  const active = jobs.filter(
    (j) =>
      j.state === 'downloading' ||
      j.state === 'queued' ||
      j.state === 'processing' ||
      j.state === 'extracting'
  )
  if (active.length === 0) {
    tray.setToolTip('YouTube Downloader')
    return
  }
  const downloading = active.filter((j) => j.state === 'downloading')
  const avg =
    downloading.length > 0
      ? Math.round(downloading.reduce((sum, j) => sum + j.percent, 0) / downloading.length)
      : 0
  tray.setToolTip(
    `YouTube Downloader — ${active.length} active${avg > 0 ? ` (${avg}%)` : ''}`
  )
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
