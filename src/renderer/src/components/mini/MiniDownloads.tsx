import { useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
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
 * immediately with the saved defaults - no resolve step. The compact job list
 * mirrors the main window's queue live.
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
      <section className="shrink-0 space-y-1.5">
        <div className="field field-red group flex items-center gap-2 px-3 py-2">
          <Link2
            size={14}
            className="shrink-0 text-white/40 group-focus-within:text-red-400/80"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void start()}
            placeholder="Paste a video link to download…"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-xs text-white/90 outline-none placeholder:text-white/30"
          />
          {url && (
            <button
              onClick={() => setUrl('')}
              title="Clear"
              aria-label="Clear link"
              className="shrink-0 rounded p-0.5 text-white/30 transition-colors hover:bg-white/10 hover:text-white/70"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          <KindChip
            active={kind === 'video'}
            onClick={() => setKind('video')}
            icon={<Video size={12} />}
            label="Video"
          />
          <KindChip
            active={kind === 'audio'}
            onClick={() => setKind('audio')}
            icon={<Music size={12} />}
            label="Audio"
          />
          <button
            onClick={() => void start()}
            disabled={!valid}
            className="btn btn-red ml-auto px-3 py-1 text-xs"
          >
            <Download size={13} />
            Download
          </button>
        </div>
        {error && (
          <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1 text-[11px] text-red-300">
            {error}
          </p>
        )}
      </section>

      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-white/30">
          No downloads yet
        </p>
      ) : (
        <div className="space-y-1.5">
          {sorted.map((job) => (
            <MiniJobRow key={job.id} job={job} />
          ))}
        </div>
      )}
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
      className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-all duration-150 ${
        active
          ? 'border-red-500/50 bg-gradient-to-b from-red-500/20 to-red-500/5 text-red-200 shadow-[0_0_12px_-2px_rgba(239,68,68,0.35)]'
          : 'border-white/10 text-white/50 hover:border-white/25 hover:text-white/80'
      }`}
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
    <div
      className={`rounded-lg border p-2 ${
        isActive ? 'border-red-500/25 bg-red-500/5' : 'border-white/5 bg-white/2'
      }`}
    >
      <div className="flex items-center gap-2">
        <MiniStateIcon state={job.state} />
        <span
          className={`min-w-0 flex-1 truncate text-xs ${
            isActive ? 'text-white/90' : 'text-white/70'
          }`}
          title={job.title}
        >
          {job.title}
        </span>
        {job.state === 'completed' && (
          <>
            <PlayInDiscord title={job.title} url={job.url} filePath={job.outputPath} />
            <button
              onClick={() => window.api.system.showItem(job.outputPath ?? '')}
              className="rounded p-1 text-white/40 transition-colors hover:text-white"
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
            className="rounded p-1 text-white/40 hover:text-red-400"
            aria-label="Cancel"
            title="Cancel"
          >
            <X size={13} />
          </button>
        )}
      </div>
      {isActive && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/5">
          {job.percent > 0 ? (
            <div
              className="h-full bg-red-500 transition-all"
              style={{ width: `${job.percent}%` }}
            />
          ) : (
            <div className="progress-indeterminate h-full rounded-full bg-red-500" />
          )}
        </div>
      )}
    </div>
  )
}

function MiniStateIcon({ state }: { state: DownloadState }): React.JSX.Element {
  switch (state) {
    case 'completed':
      return <CheckCircle2 size={13} className="shrink-0 text-emerald-400" />
    case 'error':
      return <AlertCircle size={13} className="shrink-0 text-red-400" />
    case 'cancelled':
      return <X size={13} className="shrink-0 text-white/30" />
    case 'queued':
      return <Loader2 size={13} className="shrink-0 animate-spin text-white/30" />
    default:
      return <Loader2 size={13} className="shrink-0 animate-spin text-red-400" />
  }
}
