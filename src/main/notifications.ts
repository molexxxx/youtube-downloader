import { Notification } from 'electron'
import { join } from 'path'
import type { DownloadJob } from '@shared/types'
import { getConfig } from './config'
import { getMainWindow } from './windows'

const ICON = join(__dirname, '../../resources/icon.png')

/** Show a desktop notification for a finished download, respecting the user setting. */
export function notifyDownload(job: DownloadJob): void {
  if (!getConfig().notifications || !Notification.isSupported()) return

  const success = job.state === 'completed'
  const notification = new Notification({
    title: success ? 'Download complete' : 'Download failed',
    body: success ? job.title : `${job.title} - ${job.error ?? 'unknown error'}`,
    icon: ICON,
    silent: false
  })

  notification.on('click', () => {
    const win = getMainWindow()
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })

  notification.show()
}
