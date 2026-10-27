import { useEffect, useRef, useState } from 'react'
import { Bot, ChevronDown, ChevronUp, ChevronsUp, User, X } from 'lucide-react'
import type { Track } from '@shared/types'
import { useAppStore } from '../../stores/appStore'
import { formatDuration } from '../../lib/format'

/** Tracks that finished playing this session, newest first, per server. */
const recentlyPlayed = new Map<string, Track[]>()
const PLAYED_SHOWN = 2

/** Records the previous now-playing track whenever it changes on the same server. */
function usePlayedTracks(guildId: string | null, nowPlaying: Track | null): Track[] {
  const previous = useRef<{ guildId: string | null; track: Track | null }>({
    guildId,
    track: nowPlaying
  })
  const [, setVersion] = useState(0)

  useEffect(() => {
    const before = previous.current
    previous.current = { guildId, track: nowPlaying }
    if (!guildId || before.guildId !== guildId || !before.track) return
    if (before.track.id === nowPlaying?.id) return
    const played = before.track
    const list = [
      played,
      ...(recentlyPlayed.get(guildId) ?? []).filter((t) => t.id !== played.id)
    ]
    recentlyPlayed.set(guildId, list.slice(0, PLAYED_SHOWN))
    setVersion((v) => v + 1)
  }, [guildId, nowPlaying])

  return guildId ? (recentlyPlayed.get(guildId) ?? []) : []
}

/**
 * The Up next sheet: recently played tracks struck through, the playing track
 * circled, then the queue. Each row carries its running time drawn to scale;
 * reorder and remove actions appear on hover or keyboard focus.
 */
export function QueueList(): React.JSX.Element | null {
  const guildId = useAppStore((s) => s.activeGuildId)
  const player = useAppStore((s) =>
    s.activeGuildId ? (s.playerStates[s.activeGuildId] ?? null) : null
  )
  const nowPlaying = player?.nowPlaying ?? null
  const played = usePlayedTracks(guildId, nowPlaying)

  if (!guildId) return null
  const queue = player?.queue ?? []
  const totalSeconds = queue.reduce((sum, t) => sum + (t.duration ?? 0), 0)
  const longest = Math.max(
    1,
    ...queue.map((t) => t.duration ?? 0),
    nowPlaying?.duration ?? 0,
    ...played.map((t) => t.duration ?? 0)
  )
  const playedInOrder = [...played].reverse()
  const firstQueuedNumber = playedInOrder.length + (nowPlaying ? 1 : 0) + 1

  const move = (from: number, to: number): void => {
    void window.api.discord.moveTrack(guildId, from, to)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-5">
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--t-rule-strong)] pb-4">
        <p className="text-[13px] tabular-nums text-[var(--t-dim)]">
          {queue.length} {queue.length === 1 ? 'track' : 'tracks'}
          {totalSeconds > 0 && ` · ${formatDuration(totalSeconds)} left`}
        </p>
        {queue.length > 0 && (
          <button
            onClick={() => void window.api.discord.control(guildId, 'clear')}
            className="text-[13px] text-[var(--t-dim)] transition-colors hover:text-[var(--t-red)]"
          >
            Clear queue
          </button>
        )}
      </div>

      {!nowPlaying && queue.length === 0 && playedInOrder.length === 0 ? (
        <div className="pt-5">
          <p className="text-[15px] font-semibold">The queue is empty</p>
          <p className="mt-1 text-sm text-[var(--t-dim)]">
            Search or paste a link on the left, or send tracks over from your Downloads.
          </p>
        </div>
      ) : (
        <ol className="scroll-ink -mr-6 min-h-0 flex-1 overflow-y-auto pr-[14px]">
          {playedInOrder.map((track, i) => (
            <TrackRow
              key={`played-${track.id}`}
              track={track}
              number={i + 1}
              longest={longest}
              state="played"
            />
          ))}
          {nowPlaying && (
            <TrackRow
              track={nowPlaying}
              number={playedInOrder.length + 1}
              longest={longest}
              state="playing"
            />
          )}
          {queue.map((track, index) => (
            <TrackRow
              key={track.id}
              track={track}
              number={firstQueuedNumber + index}
              longest={longest}
              state="queued"
            >
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
            </TrackRow>
          ))}
          {nowPlaying && queue.length === 0 && (
            <li className="py-4 text-sm text-[var(--t-dim)]">Nothing else queued.</li>
          )}
        </ol>
      )}
    </div>
  )
}

function TrackRow({
  track,
  number,
  longest,
  state,
  children
}: {
  track: Track
  number: number
  longest: number
  state: 'played' | 'playing' | 'queued'
  children?: React.ReactNode
}): React.JSX.Element {
  const share = track.duration ? Math.max(4, (track.duration / longest) * 100) : 0
  const struck = state === 'played'

  return (
    <li
      aria-current={state === 'playing' ? 'true' : undefined}
      className="group grid grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-3 border-b border-[var(--t-rule)] py-2.5"
    >
      {state === 'playing' ? (
        <span className="numeral flex h-7 w-7 items-center justify-center justify-self-end rounded-full border-2 border-[var(--w-blue)] text-xs text-[var(--t-blue)]">
          {number}
        </span>
      ) : (
        <span
          className={`numeral pt-1 text-right text-sm ${
            struck ? 'text-[var(--t-faint)]' : 'text-[var(--t-dim)]'
          }`}
        >
          {number}
        </span>
      )}
      <div className="min-w-0 pt-0.5">
        <p
          className={`truncate text-sm font-semibold ${
            struck
              ? 'text-[var(--t-faint)] line-through decoration-[var(--t-faint)]'
              : state === 'playing'
                ? 'text-[var(--t-blue)]'
                : ''
          }`}
          title={track.title}
        >
          {track.title}
        </p>
        <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-[var(--t-dim)]">
          {state === 'playing' ? (
            <span className="shrink-0 font-semibold text-[var(--t-blue)]">
              Now playing ·
            </span>
          ) : track.requestedBy.source === 'discord' ? (
            <User size={11} className="shrink-0" />
          ) : (
            <Bot size={11} className="shrink-0" />
          )}
          <span className="truncate">
            {state === 'playing' ? 'added by ' : ''}
            {track.requestedBy.username}
            {track.uploader && ` · ${track.uploader}`}
          </span>
        </p>
        {share > 0 && (
          <span aria-hidden="true" className="mt-1.5 block h-[3px] bg-[var(--t-rule)]">
            <span
              className={`block h-full ${
                state === 'playing' ? 'bg-[var(--w-blue)]' : 'bg-[var(--t-dim)]'
              }`}
              style={{ width: `${share}%` }}
            />
          </span>
        )}
      </div>
      <div className="relative flex min-w-[52px] justify-end pt-1">
        <span
          className={`text-[13px] tabular-nums text-[var(--t-dim)] ${
            children
              ? 'transition-opacity group-focus-within:opacity-0 group-hover:opacity-0'
              : ''
          }`}
        >
          {formatDuration(track.duration)}
        </span>
        {children && (
          <div className="pointer-events-none absolute right-0 top-0 flex items-center gap-0.5 bg-[var(--w-panel)] pl-1.5 opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
            {children}
          </div>
        )}
      </div>
    </li>
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
      className={`rounded-sm bg-[var(--w-panel)] p-1 text-[var(--t-dim)] transition-colors hover:bg-[var(--t-hover)] ${
        destructive ? 'hover:text-[var(--t-red)]' : 'hover:text-[var(--t-blue)]'
      }`}
    >
      {children}
    </button>
  )
}
