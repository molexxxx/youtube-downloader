import { Bot, ChevronDown, ChevronUp, ChevronsUp, ListMusic, User, X } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { formatDuration } from '../../lib/format'

/**
 * Upcoming tracks for the active server. Rows expose hover actions: play next,
 * nudge up/down, and remove. The header shows the total queued runtime.
 */
export function QueueList(): React.JSX.Element | null {
  const guildId = useAppStore((s) => s.activeGuildId)
  const player = useAppStore((s) =>
    s.activeGuildId ? (s.playerStates[s.activeGuildId] ?? null) : null
  )

  if (!guildId) return null
  const queue = player?.queue ?? []
  const totalSeconds = queue.reduce((sum, t) => sum + (t.duration ?? 0), 0)

  const move = (from: number, to: number): void => {
    void window.api.discord.moveTrack(guildId, from, to)
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-2.5">
        <span className="flex items-center gap-2 text-xs font-medium text-white/50">
          <ListMusic size={14} />
          Up next
          {queue.length > 0 && (
            <span className="rounded-full bg-white/5 px-2 py-0.5 tabular-nums text-white/45">
              {queue.length} {queue.length === 1 ? 'track' : 'tracks'}
              {totalSeconds > 0 && ` · ${formatDuration(totalSeconds)}`}
            </span>
          )}
        </span>
        {queue.length > 0 && (
          <button
            onClick={() => void window.api.discord.control(guildId, 'clear')}
            className="text-xs text-white/40 transition-colors hover:text-red-300"
          >
            Clear all
          </button>
        )}
      </div>
      {queue.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 py-8 text-center">
          <p className="text-sm text-white/40">The queue is empty</p>
          <p className="text-xs text-white/25">
            Search above, paste a link, or send tracks over from your Downloads.
          </p>
        </div>
      ) : (
        <ul className="scroll-thin-indigo min-h-0 flex-1 divide-y divide-white/5 overflow-y-auto">
          {queue.map((track, index) => (
            <li
              key={track.id}
              className="group flex items-center gap-3 px-3 py-2 transition-colors hover:bg-white/[0.03]"
            >
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-white/30">
                {index + 1}
              </span>
              <div className="relative h-9 w-14 shrink-0 overflow-hidden rounded bg-white/5">
                {track.thumbnail && (
                  <img
                    src={track.thumbnail}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white/85">{track.title}</p>
                <p className="flex items-center gap-1 text-[11px] text-white/35">
                  {track.requestedBy.source === 'discord' ? (
                    <User size={11} />
                  ) : (
                    <Bot size={11} />
                  )}
                  {track.requestedBy.username}
                  {track.uploader && (
                    <span className="truncate"> · {track.uploader}</span>
                  )}
                </p>
              </div>
              {track.duration ? (
                <span className="shrink-0 text-xs tabular-nums text-white/35 group-hover:hidden">
                  {formatDuration(track.duration)}
                </span>
              ) : null}
              <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                {index > 0 && (
                  <RowAction label="Play next" onClick={() => move(index, 0)}>
                    <ChevronsUp size={14} />
                  </RowAction>
                )}
                {index > 0 && (
                  <RowAction label="Move up" onClick={() => move(index, index - 1)}>
                    <ChevronUp size={14} />
                  </RowAction>
                )}
                {index < queue.length - 1 && (
                  <RowAction label="Move down" onClick={() => move(index, index + 1)}>
                    <ChevronDown size={14} />
                  </RowAction>
                )}
                <RowAction
                  label="Remove from queue"
                  destructive
                  onClick={() => void window.api.discord.removeTrack(guildId, index)}
                >
                  <X size={14} />
                </RowAction>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function RowAction({
  label,
  onClick,
  children,
  destructive
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  destructive?: boolean
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`rounded p-1 text-white/40 transition-colors hover:bg-white/10 ${
        destructive ? 'hover:text-red-300' : 'hover:text-indigo-200'
      }`}
    >
      {children}
    </button>
  )
}
