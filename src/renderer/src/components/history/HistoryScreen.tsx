import { FolderOpen, Music, Play, Trash2, Video } from 'lucide-react'
import type { HistoryEntry } from '@shared/types'
import { useAppStore } from '../../stores/appStore'
import { PlayInDiscord } from '../discord/PlayInDiscord'
import { MediaThumb } from '../shared/MediaThumb'

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
    <div className="flex max-w-5xl flex-col">
      <div className="flex items-end justify-between gap-4 border-b border-[var(--t-rule-strong)] pb-4">
        <div>
          <h1 className="display text-[24px]">Download history</h1>
          {history.length > 0 && (
            <p className="mt-2 text-sm tabular-nums text-[var(--t-dim)]">
              {history.length} {history.length === 1 ? 'download' : 'downloads'}
            </p>
          )}
        </div>
        {history.length > 0 && (
          <button
            onClick={clear}
            className="key key-line h-9 px-3 text-[13px] hover:text-[var(--t-red)]"
          >
            <Trash2 size={14} />
            Clear all
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="pt-6">
          <p className="text-[15px] font-semibold">
            No downloads yet. Completed downloads will appear here.
          </p>
          <p className="mt-1 text-sm text-[var(--t-dim)]">
            Everything you download is listed here with a way back to the file.
          </p>
        </div>
      ) : (
        <ul>
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
    <li className="-mx-3 flex items-center gap-5 border-b border-[var(--t-rule)] px-3 py-3 transition-colors hover:bg-[var(--t-hover)]">
      <MediaThumb
        url={entry.url}
        kind={entry.kind}
        size="lg"
        status={ok ? undefined : entry.status}
      />
      <div className="min-w-0 flex-1">
        <p
          className={`selectable truncate text-[15px] font-semibold ${
            ok
              ? ''
              : entry.status === 'cancelled'
                ? 'text-[var(--t-faint)] line-through decoration-[var(--t-fg)] decoration-2'
                : 'text-[var(--t-dim)]'
          }`}
          title={entry.title}
        >
          {entry.title}
        </p>
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] text-[var(--t-dim)]">
          {entry.kind === 'audio' ? (
            <Music size={13} className="shrink-0" />
          ) : (
            <Video size={13} className="shrink-0" />
          )}
          <span className="shrink-0">{entry.kind === 'audio' ? 'Audio' : 'Video'}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0 tabular-nums">{formatWhen(entry.completedAt)}</span>
          {!ok && (
            <>
              <span aria-hidden="true">·</span>
              <span
                className={`truncate ${entry.status === 'error' ? 'text-[var(--t-red)]' : ''}`}
                title={entry.error ?? undefined}
              >
                {entry.error ?? 'Cancelled'}
              </span>
            </>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {ok && entry.outputPath && (
          <button
            onClick={() => void window.api.system.openPath(entry.outputPath!)}
            className="key key-line mr-1 h-8 px-3 text-[13px]"
            title="Open in your default player"
          >
            <Play size={13} />
            Play
          </button>
        )}
        {ok && (
          <PlayInDiscord
            title={entry.title}
            url={entry.url}
            filePath={entry.outputPath}
          />
        )}
        {ok && entry.outputPath && (
          <button
            onClick={reveal}
            className="rounded-sm p-1.5 text-[var(--t-dim)] transition-colors hover:bg-[var(--t-hover)] hover:text-[var(--t-fg)]"
            aria-label="Show in folder"
            title="Show in folder"
          >
            <FolderOpen size={15} />
          </button>
        )}
        <button
          onClick={remove}
          className="rounded-sm p-1.5 text-[var(--t-dim)] transition-colors hover:bg-[var(--t-hover)] hover:text-[var(--t-red)]"
          aria-label="Remove from history"
          title="Remove"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </li>
  )
}
