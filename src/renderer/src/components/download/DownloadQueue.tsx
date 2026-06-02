import { FolderOpen, X, CheckCircle2, AlertCircle, Loader2, Trash2 } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import type { DownloadJob } from '@shared/types'

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
      {jobs
        .slice()
        .reverse()
        .map((job) => (
          <JobRow key={job.id} job={job} />
        ))}
    </div>
  )
}

function JobRow({ job }: { job: DownloadJob }): React.JSX.Element {
  const active = job.state === 'downloading' || job.state === 'processing'
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 flex-1 truncate text-sm">{job.title}</span>
        <StateIcon job={job} />
        {job.state === 'completed' && (
          <button
            onClick={() => window.api.system.showItem(job.outputPath ?? '')}
            className="rounded p-1 text-white/40 hover:text-white"
            aria-label="Show in folder"
          >
            <FolderOpen size={15} />
          </button>
        )}
        {active && (
          <button
            onClick={() => window.api.download.cancel(job.id)}
            className="rounded p-1 text-white/40 hover:text-red-400"
            aria-label="Cancel"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {active && (
        <div className="mt-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full bg-red-500 transition-all"
              style={{ width: `${job.percent}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-white/40">
            <span>{job.percent.toFixed(0)}%</span>
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
      return <CheckCircle2 size={16} className="text-emerald-400" />
    case 'error':
      return <AlertCircle size={16} className="text-red-400" />
    case 'cancelled':
      return <X size={16} className="text-white/30" />
    default:
      return <Loader2 size={16} className="animate-spin text-red-400" />
  }
}
