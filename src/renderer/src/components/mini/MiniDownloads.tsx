import { useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  FolderOpen,
  Link2,
  Loader2,
  Music,
  Video,
  X
} from 'lucide-react'
import type { DownloadJob, DownloadKind, DownloadState } from '@shared/types'
import { useAppStore } from '../../stores/appStore'
import { looksLikeUrl } from '../../lib/format'
import { PlayInDiscord } from '../discord/PlayInDiscord'

const STATE_PRIORITY: Partial<Record<DownloadState, number>> = {
  downloading: 0,
  processing: 0,
  extracting: 0,
  queued: 1
}

/**
 * Download quick actions: paste a link, pick video or audio, and it starts
 * immediately with the saved defaults - no resolve step. The link entry sits
 * up top; the job list below a rule mirrors the main window's queue.
 */
export function MiniDownloads(): React.JSX.Element {
  const jobs = useAppStore((s) => s.jobs)
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState<DownloadKind>('video')
  const [error, setError] = useState<string | null>(null)

  const trimmed = url.trim()
  const valid = looksLikeUrl(trimmed)

  const sorted = jobs.slice().sort((a, b) => {
    const pa = STATE_PRIORITY[a.state] ?? 2
    const pb = STATE_PRIORITY[b.state] ?? 2
    if (pa !== pb) return pa - pb
    return b.createdAt - a.createdAt
  })

  async function start(): Promise<void> {
    if (!valid) return
    setError(null)
    try {
      // Quick action: saved defaults, single video only (no playlist expansion).
      await window.api.download.start({ url: trimmed, kind, noPlaylist: true })
      setUrl('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start the download')
    }
  }

  return (
    <>
      <section className="shrink-0 space-y-3 py-4 pl-4 pr-1.5">
        <div className="line-field line-field-red group pb-2">
          <Link2
            size={15}
            className="shrink-0 text-[var(--t-faint)] transition-colors group-focus-within:text-[var(--t-red)]"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void start()}
            placeholder="Paste a video link to download…"
            aria-label="Video link"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          {url && (
            <button
              onClick={() => setUrl('')}
              title="Clear"
              aria-label="Clear link"
              className="shrink-0 rounded-sm p-0.5 text-[var(--t-dim)] transition-colors hover:bg-[var(--t-hover)] hover:text-[var(--t-fg)]"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <KindChip
            active={kind === 'video'}
            onClick={() => setKind('video')}
            icon={<Video size={13} />}
            label="Video"
          />
          <KindChip
            active={kind === 'audio'}
            onClick={() => setKind('audio')}
            icon={<Music size={13} />}
            label="Audio"
          />
          <button
            onClick={() => void start()}
            disabled={!valid}
            className="key key-red ml-auto h-9 px-4 text-[13px]"
          >
            <Download size={14} />
            Download
          </button>
        </div>
        {error && (
          <p
            role="alert"
            className="flex items-start gap-1.5 text-xs text-[var(--t-red)]"
          >
            <AlertCircle size={13} className="mt-px shrink-0" />
            {error}
          </p>
        )}
      </section>

      <section
        aria-label="Downloads"
        className="min-h-[140px] flex-1 border-t border-[var(--t-rule-strong)] py-3 pl-4 pr-1.5"
      >
        {sorted.length === 0 ? (
          <p className="text-sm font-semibold">No downloads yet</p>
        ) : (
          <ul className="border-t border-[var(--t-rule-strong)]">
            {sorted.map((job) => (
              <MiniJobRow key={job.id} job={job} />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function KindChip({
  active,
  onClick,
  icon,
  label
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="chip flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
    >
      {icon}
      {label}
    </button>
  )
}

function MiniJobRow({ job }: { job: DownloadJob }): React.JSX.Element {
  const isActive =
    job.state === 'downloading' ||
    job.state === 'processing' ||
    job.state === 'extracting'

  return (
    <li className="border-b border-[var(--t-rule)] py-2">
      <div className="flex items-center gap-2">
        <MiniStateIcon state={job.state} />
        <span
          className={`min-w-0 flex-1 truncate text-xs ${
            isActive
              ? 'font-semibold'
              : job.state === 'cancelled'
                ? 'text-[var(--t-faint)] line-through decoration-[var(--t-fg)]'
                : 'text-[var(--t-dim)]'
          }`}
          title={job.title}
        >
          {job.title}
        </span>
        {isActive && job.percent > 0 && (
          <span className="shrink-0 text-[11px] tabular-nums text-[var(--t-dim)]">
            {job.percent.toFixed(0)}%
          </span>
        )}
        {job.state === 'completed' && (
          <>
            <PlayInDiscord title={job.title} url={job.url} filePath={job.outputPath} />
            <button
              onClick={() => window.api.system.showItem(job.outputPath ?? '')}
              className="rounded-sm p-1 text-[var(--t-dim)] transition-colors hover:bg-[var(--t-hover)] hover:text-[var(--t-fg)]"
              aria-label="Show in folder"
              title="Show in folder"
            >
              <FolderOpen size={13} />
            </button>
          </>
        )}
        {isActive && (
          <button
            onClick={() => window.api.download.cancel(job.id)}
            className="rounded-sm p-1 text-[var(--t-dim)] transition-colors hover:bg-[var(--t-hover)] hover:text-[var(--t-red)]"
            aria-label="Cancel"
            title="Cancel"
          >
            <X size={13} />
          </button>
        )}
      </div>
      {isActive && (
        <div className="mt-1.5 h-1 overflow-hidden bg-[var(--t-rule)]">
          {job.percent > 0 ? (
            <div
              className="h-full bg-[var(--w-red)] transition-[width] duration-300 ease-out"
              style={{ width: `${job.percent}%` }}
            />
          ) : (
            <div className="progress-indeterminate h-full bg-[var(--w-red)]" />
          )}
        </div>
      )}
      {job.state === 'error' && job.error && (
        <p
          className="mt-1 truncate pl-5 text-[11px] text-[var(--t-red)]"
          title={job.error}
        >
          {job.error}
        </p>
      )}
    </li>
  )
}

function MiniStateIcon({ state }: { state: DownloadState }): React.JSX.Element {
  switch (state) {
    case 'completed':
      return <CheckCircle2 size={13} className="shrink-0 text-[var(--t-ok)]" />
    case 'error':
      return <AlertCircle size={13} className="shrink-0 text-[var(--t-red)]" />
    case 'cancelled':
      return <X size={13} className="shrink-0 text-[var(--t-faint)]" />
    case 'queued':
      return (
        <Clock size={13} aria-label="Queued" className="shrink-0 text-[var(--t-faint)]" />
      )
    default:
      return <Loader2 size={13} className="shrink-0 animate-spin text-[var(--t-red)]" />
  }
}
