import {
  FolderOpen,
  Play,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2
} from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { PlayInDiscord } from '../discord/PlayInDiscord'
import type { DownloadJob, DownloadState } from '@shared/types'

// Lower number = shown first. Active jobs float to the top, queued next,
// terminal (completed/error/cancelled) at the bottom.
const STATE_PRIORITY: Partial<Record<DownloadState, number>> = {
  downloading: 0,
  processing: 0,
  extracting: 0,
  queued: 1
}

export function DownloadQueue(): React.JSX.Element {
  const jobs = useAppStore((s) => s.jobs)
  const clearFinishedJobs = useAppStore((s) => s.clearFinishedJobs)

  if (jobs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-white/30">
        No downloads yet
      </div>
    )
  }

  const hasFinished = jobs.some(
    (j) => j.state === 'completed' || j.state === 'error' || j.state === 'cancelled'
  )

  const sorted = jobs.slice().sort((a, b) => {
    const pa = STATE_PRIORITY[a.state] ?? 2
    const pb = STATE_PRIORITY[b.state] ?? 2
    if (pa !== pb) return pa - pb
    return a.createdAt - b.createdAt
  })

  return (
    <div className="space-y-2">
      {hasFinished && (
        <button
          onClick={clearFinishedJobs}
          className="flex items-center gap-1.5 self-end text-xs text-white/40 hover:text-white/70"
        >
          <Trash2 size={13} />
          Clear finished
        </button>
      )}
      {sorted.map((job) => (
        <JobRow key={job.id} job={job} />
      ))}
    </div>
  )
}

function JobRow({ job }: { job: DownloadJob }): React.JSX.Element {
  const isActive =
    job.state === 'downloading' ||
    job.state === 'processing' ||
    job.state === 'extracting'

  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        isActive ? 'border-red-500/25 bg-red-500/5' : 'border-white/5 bg-white/2'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`min-w-0 flex-1 truncate text-sm ${isActive ? 'text-white/90' : ''}`}
        >
          {job.title}
        </span>
        <StateIcon job={job} />
        {job.state === 'completed' && (
          <>
            <button
              onClick={() => job.outputPath && window.api.system.openPath(job.outputPath)}
              className="rounded p-1 text-white/40 transition-colors hover:text-emerald-300"
              aria-label="Preview file"
              title="Preview in your default player"
            >
              <Play size={15} />
            </button>
            <PlayInDiscord title={job.title} url={job.url} filePath={job.outputPath} />
            <button
              onClick={() => window.api.system.showItem(job.outputPath ?? '')}
              className="rounded p-1 text-white/40 transition-colors hover:text-white"
              aria-label="Show in folder"
              title="Show in folder"
            >
              <FolderOpen size={15} />
            </button>
          </>
        )}
        {isActive && (
          <button
            onClick={() => window.api.download.cancel(job.id)}
            className="rounded p-1 text-white/40 hover:text-red-400"
            aria-label="Cancel"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {isActive && (
        <div className="mt-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            {job.percent > 0 ? (
              <div
                className="h-full bg-red-500 transition-all"
                style={{ width: `${job.percent}%` }}
              />
            ) : (
              <div className="progress-indeterminate h-full rounded-full bg-red-500" />
            )}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-white/40">
            <span>
              {job.percent > 0
                ? `${job.percent.toFixed(0)}%`
                : job.state === 'processing'
                  ? 'Processing…'
                  : 'Downloading…'}
            </span>
            <span>
              {job.speed ?? ''} {job.eta ? `· ETA ${job.eta}` : ''}
            </span>
          </div>
        </div>
      )}

      {job.state === 'error' && job.error && (
        <p className="mt-1 text-[11px] text-red-400" title={job.error}>
          {job.error}
        </p>
      )}
    </div>
  )
}

function StateIcon({ job }: { job: DownloadJob }): React.JSX.Element {
  switch (job.state) {
    case 'completed':
      return <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
    case 'error':
      return <AlertCircle size={16} className="shrink-0 text-red-400" />
    case 'cancelled':
      return <X size={16} className="shrink-0 text-white/30" />
    case 'queued':
      return <Loader2 size={16} className="shrink-0 animate-spin text-white/30" />
    default:
      return <Loader2 size={16} className="shrink-0 animate-spin text-red-400" />
  }
}
