import type { DownloadJob } from '@shared/types'
import { downloadManager } from './ytdlp/downloader'
import { addHistory } from './history'
import { notifyDownload } from './notifications'
import { updateTray } from './tray'

const TERMINAL = new Set(['completed', 'error', 'cancelled'])
const recorded = new Set<string>()

/**
 * Bridges download activity to the polish surfaces: live tray progress, a desktop
 * notification when a job finishes, and a persistent history record. Each job is
 * recorded once even though terminal patches may emit more than one update.
 */
export function initDownloadObserver(): void {
  const manager = downloadManager()

  manager.on('update', (job: DownloadJob) => {
    updateTray(manager.list())

    if (!TERMINAL.has(job.state) || recorded.has(job.id)) return
    recorded.add(job.id)

    addHistory({
      id: job.id,
      url: job.url,
      title: job.title,
      kind: job.kind,
      status: job.state as 'completed' | 'error' | 'cancelled',
      outputPath: job.outputPath,
      error: job.error,
      completedAt: Date.now()
    })

    if (job.state !== 'cancelled') notifyDownload(job)
  })
}
