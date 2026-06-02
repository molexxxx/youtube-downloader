import { CheckCircle2, FolderOpen, Music, Trash2, Video, XCircle } from 'lucide-react'
import type { HistoryEntry } from '@shared/types'
import { useAppStore } from '../../stores/appStore'

function formatWhen(ms: number): string {
  const diff = Date.now() - ms
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(ms).toLocaleDateString()
}

export function HistoryScreen(): React.JSX.Element {
  const history = useAppStore((s) => s.history)
  const setHistory = useAppStore((s) => s.setHistory)

  const clear = async (): Promise<void> => {
    setHistory(await window.api.history.clear())
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Download history</h1>
        {history.length > 0 && (
          <button
            onClick={clear}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:border-red-500/40 hover:text-red-300"
          >
            <Trash2 size={13} />
            Clear all
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-white/30">
          No downloads yet. Completed downloads will appear here.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {history.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} setHistory={setHistory} />
          ))}
        </ul>
      )}
    </div>
  )
}

function HistoryRow({
  entry,
  setHistory
}: {
  entry: HistoryEntry
  setHistory: (h: HistoryEntry[]) => void
}): React.JSX.Element {
  const ok = entry.status === 'completed'

  const reveal = (): void => {
    if (entry.outputPath) void window.api.system.showItem(entry.outputPath)
  }
  const remove = async (): Promise<void> => {
    setHistory(await window.api.history.remove(entry.id))
  }

  return (
    <li className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
      <span className={ok ? 'text-emerald-400' : 'text-red-400'}>
        {ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
      </span>
      <span className="text-white/40">
        {entry.kind === 'audio' ? <Music size={15} /> : <Video size={15} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm" title={entry.title}>
          {entry.title}
        </p>
        <p className="truncate text-xs text-white/40">
          {formatWhen(entry.completedAt)}
          {!ok && entry.error ? ` — ${entry.error}` : ''}
        </p>
      </div>
      {ok && entry.outputPath && (
        <button
          onClick={reveal}
          className="rounded p-1.5 text-white/40 hover:text-white"
          aria-label="Show in folder"
          title="Show in folder"
        >
          <FolderOpen size={15} />
        </button>
      )}
      <button
        onClick={remove}
        className="rounded p-1.5 text-white/40 hover:text-red-400"
        aria-label="Remove from history"
        title="Remove"
      >
        <Trash2 size={15} />
      </button>
    </li>
  )
}
