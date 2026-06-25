import { Bot, ListMusic, User, X } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { formatDuration } from '../../lib/format'

/** Upcoming tracks for the active server, with requester badges and removal. */
export function QueueList(): React.JSX.Element | null {
  const guildId = useAppStore((s) => s.activeGuildId)
  const player = useAppStore((s) =>
    s.activeGuildId ? (s.playerStates[s.activeGuildId] ?? null) : null
  )

  if (!guildId) return null
  const queue = player?.queue ?? []

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
      <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-3.5 py-2">
        <span className="flex items-center gap-2 text-xs font-medium text-white/45">
          <ListMusic size={14} />
          Up next · {queue.length}
        </span>
        {queue.length > 0 && (
          <button
            onClick={() => void window.api.discord.control(guildId, 'clear')}
            className="text-xs text-white/40 transition-colors hover:text-red-300"
          >
            Clear
          </button>
        )}
      </div>
      {queue.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 py-8 text-center text-sm text-white/30">
          The queue is empty. Search or paste a link to add tracks.
        </div>
      ) : (
        <ul className="scroll-thin min-h-0 flex-1 divide-y divide-white/5 overflow-y-auto">
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
                  <img src={track.thumbnail} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white/80">{track.title}</p>
                <p className="flex items-center gap-1 text-[11px] text-white/35">
                  {track.requestedBy.source === 'discord' ? (
                    <User size={11} />
                  ) : (
                    <Bot size={11} />
                  )}
                  {track.requestedBy.username}
                </p>
              </div>
              {track.duration ? (
                <span className="shrink-0 text-xs tabular-nums text-white/35">
                  {formatDuration(track.duration)}
                </span>
              ) : null}
              <button
                onClick={() => void window.api.discord.removeTrack(guildId, index)}
                aria-label="Remove from queue"
                className="shrink-0 rounded p-1 text-white/25 opacity-0 transition-all hover:bg-white/10 hover:text-white/70 group-hover:opacity-100"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
