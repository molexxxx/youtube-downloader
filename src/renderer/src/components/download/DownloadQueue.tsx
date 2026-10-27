import { Clock, FolderOpen, Play, Trash2, X } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { PlayInDiscord } from '../discord/PlayInDiscord'
import { MediaThumb } from '../shared/MediaThumb'
import type { DownloadJob, DownloadState } from '@shared/types'

const ACTIVE_STATES: DownloadState[] = ['downloading', 'processing', 'extracting']

function isActive(job: DownloadJob): boolean {
  return ACTIVE_STATES.includes(job.state)
}

function isFinished(job: DownloadJob): boolean {
  return job.state === 'completed' || job.state === 'error' || job.state === 'cancelled'
}

const ROW_ICON =
  'rounded-sm p-1 text-[var(--t-dim)] transition-colors hover:bg-[var(--t-hover)] hover:text-[var(--t-fg)]'

/**
 * The Downloads sheet, grouped by stage: in-progress jobs with a progress
 * line, then a compact queued list, then finished jobs (newest first) with
 * their file actions. Cancelled jobs are struck through.
 */
export function DownloadQueue(): React.JSX.Element {
  const jobs = useAppStore((s) => s.jobs)
  const clearFinishedJobs = useAppStore((s) => s.clearFinishedJobs)

  if (jobs.length === 0) {
    return (
      <div className="border-t border-[var(--t-rule-strong)] pt-4">
        <p className="text-sm font-semibold">No downloads yet</p>
        <p className="mt-1 text-sm text-[var(--t-dim)]">
          Resolve a link on the left and press Download.
        </p>
      </div>
    )
  }

  const byCreated = (a: DownloadJob, b: DownloadJob): number => a.createdAt - b.createdAt
  const active = jobs.filter(isActive).sort(byCreated)
  const queued = jobs.filter((j) => j.state === 'queued').sort(byCreated)
  const finished = jobs.filter(isFinished).sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div className="flex flex-col gap-6">
      {active.length > 0 && (
        <QueueGroup label="In progress" count={active.length}>
          {active.map((job) => (
            <ActiveJob key={job.id} job={job} />
          ))}
        </QueueGroup>
      )}

      {queued.length > 0 && (
        <QueueGroup label="Queued" count={queued.length}>
          {queued.map((job) => (
            <li
              key={job.id}
              className="flex items-center gap-3 border-b border-[var(--t-rule)] py-2"
            >
              <MediaThumb url={job.url} kind={job.kind} dim />
              <span
                className="min-w-0 flex-1 truncate text-sm text-[var(--t-dim)]"
                title={job.title}
              >
                {job.title}
              </span>
              <Clock
                size={14}
                role="img"
                aria-label="Queued"
                className="shrink-0 text-[var(--t-faint)]"
              />
            </li>
          ))}
        </QueueGroup>
      )}

      {finished.length > 0 && (
        <QueueGroup
          label="Finished"
          count={finished.length}
          action={
            <button
              onClick={clearFinishedJobs}
              className="flex items-center gap-1 text-[13px] text-[var(--t-dim)] transition-colors hover:text-[var(--t-red)]"
            >
              <Trash2 size={13} />
              Clear finished
            </button>
          }
        >
          {finished.map((job) => (
            <FinishedJob key={job.id} job={job} />
          ))}
        </QueueGroup>
      )}
    </div>
  )
}

function QueueGroup({
  label,
  count,
  action,
  children
}: {
  label: string
  count: number
  action?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section aria-label={label}>
      <div className="flex items-baseline justify-between gap-2 border-b border-[var(--t-rule-strong)] pb-2">
        <h3 className="flex items-baseline gap-2 text-[13px] font-semibold">
          {label}
          <span className="font-normal tabular-nums text-[var(--t-faint)]">{count}</span>
        </h3>
        {action}
      </div>
      <ul>{children}</ul>
    </section>
  )
}

function ActiveJob({ job }: { job: DownloadJob }): React.JSX.Element {
  const progress =
    job.percent > 0
      ? `${job.percent.toFixed(0)}%`
      : job.state === 'processing'
        ? 'Processing…'
        : 'Downloading…'
  const rate = [job.speed, job.eta ? `ETA ${job.eta}` : null].filter(Boolean).join(' · ')

  return (
    <li className="border-b border-[var(--t-rule)] py-3">
      <div className="flex items-start gap-3">
        <MediaThumb url={job.url} kind={job.kind} size="md" />
        <p
          className="line-clamp-2 min-w-0 flex-1 text-sm font-semibold leading-snug"
          title={job.title}
        >
          {job.title}
        </p>
        <button
          onClick={() => window.api.download.cancel(job.id)}
          className="-mr-1 -mt-0.5 shrink-0 rounded-sm p-1 text-[var(--t-dim)] transition-colors hover:bg-[var(--t-hover)] hover:text-[var(--t-red)]"
          aria-label="Cancel"
          title="Cancel"
        >
          <X size={15} />
        </button>
      </div>
      <div className="mt-3 h-1 overflow-hidden bg-[var(--t-rule)]">
        {job.percent > 0 ? (
          <div
            className="h-full bg-[var(--w-red)] transition-[width] duration-300 ease-out"
            style={{ width: `${job.percent}%` }}
          />
        ) : (
          <div className="progress-indeterminate h-full bg-[var(--w-red)]" />
        )}
      </div>
      <div className="mt-1.5 flex justify-between gap-2 text-xs tabular-nums text-[var(--t-dim)]">
        <span>{progress}</span>
        <span className="truncate">{rate}</span>
      </div>
    </li>
  )
}

function FinishedJob({ job }: { job: DownloadJob }): React.JSX.Element {
  const completed = job.state === 'completed'
  const cancelled = job.state === 'cancelled'
  const status =
    job.state === 'completed' || job.state === 'error' ? job.state : 'cancelled'

  return (
    <li className="border-b border-[var(--t-rule)] py-2">
      <div className="flex items-center gap-3">
        <MediaThumb url={job.url} kind={job.kind} status={status} />
        <span
          className={`min-w-0 flex-1 truncate text-sm ${
            completed
              ? ''
              : cancelled
                ? 'text-[var(--t-faint)] line-through decoration-[var(--t-fg)] decoration-2'
                : 'text-[var(--t-dim)]'
          }`}
          title={job.title}
        >
          {job.title}
        </span>
        {completed && (
          <div className="flex shrink-0 items-center">
            <button
              onClick={() => job.outputPath && window.api.system.openPath(job.outputPath)}
              className={ROW_ICON}
              aria-label="Preview file"
              title="Open in your default player"
            >
              <Play size={15} />
            </button>
            <PlayInDiscord title={job.title} url={job.url} filePath={job.outputPath} />
            <button
              onClick={() => window.api.system.showItem(job.outputPath ?? '')}
              className={ROW_ICON}
              aria-label="Show in folder"
              title="Show in folder"
            >
              <FolderOpen size={15} />
            </button>
          </div>
        )}
      </div>
      {job.state === 'error' && job.error && (
        <p
          className="mt-1 line-clamp-2 pl-[60px] text-xs text-[var(--t-red)]"
          title={job.error}
        >
          {job.error}
        </p>
      )}
    </li>
  )
}
