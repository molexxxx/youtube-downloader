import { useEffect, useState } from 'react'
import {
  Bot,
  Loader2,
  Music,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipForward,
  Square,
  User,
  Volume1,
  Volume2,
  VolumeX
} from 'lucide-react'
import type { LoopMode, PlayerControl, PlayerStatus } from '@shared/types'
import { useAppStore } from '../../stores/appStore'
import { formatClock } from '../../lib/format'
import { EffectsPopover } from './EffectsPopover'

const NEXT_LOOP: Record<LoopMode, LoopMode> = {
  off: 'track',
  track: 'queue',
  queue: 'off'
}

const LOOP_LABEL: Record<LoopMode, string> = {
  off: 'Loop off',
  track: 'Looping this track',
  queue: 'Looping the queue'
}

/**
 * Now-playing hero, which owns the stage: 16:9 artwork beside a display-size
 * title, a full-width seek line, the blue play key with the transport, and
 * volume. Volume changes apply instantly and are remembered per server.
 */
export function PlayerPanel(): React.JSX.Element | null {
  const guildId = useAppStore((s) => s.activeGuildId)
  const player = useAppStore((s) =>
    s.activeGuildId ? (s.playerStates[s.activeGuildId] ?? null) : null
  )
  const playerVolume = player?.volume
  const [vol, setVol] = useState(playerVolume ?? 100)
  const [position, setPosition] = useState(0)
  const [scrub, setScrub] = useState<number | null>(null)

  useEffect(() => {
    if (playerVolume !== undefined) setVol(playerVolume)
  }, [playerVolume])

  // Tick the elapsed time locally between state events, anchored to the last
  // positionMs the main process reported (pause-aware, resets on seek/skip).
  // At speed != 1 the media position advances faster/slower than the clock.
  useEffect(() => {
    if (!player) {
      setPosition(0)
      return
    }
    const anchorMs = player.positionMs
    const anchorAt = Date.now()
    const speed = player.effects?.speed ?? 1
    setPosition(anchorMs / 1000)
    if (player.status !== 'playing') return
    const id = window.setInterval(() => {
      setPosition((anchorMs + (Date.now() - anchorAt) * speed) / 1000)
    }, 500)
    return () => window.clearInterval(id)
  }, [player])

  if (!guildId) return null

  const np = player?.nowPlaying ?? null
  const status: PlayerStatus = player?.status ?? 'idle'
  const loop = player?.loop ?? 'off'
  const playing = status === 'playing'
  const duration = np?.duration ?? null
  const shown = scrub ?? Math.min(position, duration ?? position)
  const progressPct = duration ? Math.min(100, (shown / duration) * 100) : 0
  const title = np?.title ?? 'Nothing playing yet'

  const control = (action: PlayerControl): void => {
    void window.api.discord.control(guildId, action)
  }

  const commitSeek = (): void => {
    if (scrub == null) return
    void window.api.discord.seek(guildId, Math.round(scrub))
    setScrub(null)
  }

  const commitVolume = (value: number): void => {
    void window.api.discord.setVolume(guildId, value)
  }

  const VolumeIcon = vol === 0 ? VolumeX : vol < 50 ? Volume1 : Volume2

  return (
    <section
      aria-label="Now playing"
      className="flex min-h-0 flex-1 flex-col justify-center"
    >
      <div className="grid grid-cols-[minmax(240px,0.56fr)_minmax(0,0.44fr)] items-end gap-8">
        <div className="relative aspect-video overflow-hidden rounded-sm bg-[var(--t-rule)]">
          {np?.thumbnail ? (
            <img src={np.thumbnail} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[var(--t-faint)]">
              <Music size={40} />
            </div>
          )}
          {np && (
            <span
              className="absolute inset-x-0 bottom-0 h-1 bg-[var(--w-blue)] transition-[width] duration-500 ease-linear"
              style={{ width: `${progressPct}%` }}
            />
          )}
        </div>

        <div className="min-w-0 pb-1">
          <h2
            className={`display line-clamp-3 text-[26px] 2xl:text-[32px] ${
              np ? '' : 'text-[var(--t-faint)]'
            }`}
            title={np?.title}
          >
            {title}
          </h2>
          {np ? (
            <p className="mt-4 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-[var(--t-dim)]">
              {np.uploader && (
                <>
                  <span className="min-w-0 truncate font-semibold text-[var(--t-fg)]">
                    {np.uploader}
                  </span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              <span className="flex shrink-0 items-center gap-1.5">
                {np.requestedBy.source === 'discord' ? (
                  <User size={14} />
                ) : (
                  <Bot size={14} />
                )}
                added by {np.requestedBy.username}
              </span>
              <StatusNote status={status} />
            </p>
          ) : (
            <p className="mt-4 text-[15px] text-[var(--t-dim)]">
              Search or paste a link above, or send tracks over from your Downloads.
            </p>
          )}
        </div>
      </div>

      <div className="mt-8 flex items-center gap-4">
        <span className="w-11 shrink-0 text-[13px] tabular-nums text-[var(--t-dim)]">
          {formatClock(shown)}
        </span>
        <input
          type="range"
          min={0}
          max={duration ?? 100}
          step={1}
          value={Math.floor(shown)}
          disabled={!np || !duration}
          onChange={(e) => setScrub(Number(e.target.value))}
          onPointerUp={commitSeek}
          onKeyDown={(e) => e.key === 'Enter' && commitSeek()}
          onBlur={commitSeek}
          aria-label="Seek"
          className="line-range flex-1"
          style={{
            background: `linear-gradient(90deg, var(--t-accent) ${progressPct}%, var(--t-rule-strong) ${progressPct}%)`
          }}
        />
        <span className="w-11 shrink-0 text-right text-[13px] tabular-nums text-[var(--t-dim)]">
          {duration ? formatClock(duration) : '--:--'}
        </span>
      </div>

      <div className="mt-5 flex items-center gap-2">
        <button
          onClick={() => control(playing ? 'pause' : 'resume')}
          disabled={!np}
          title={playing ? 'Pause' : 'Resume'}
          aria-label={playing ? 'Pause' : 'Resume'}
          className="key key-blue mr-2 h-14 w-14"
        >
          {playing ? (
            <Pause size={20} fill="currentColor" />
          ) : (
            <Play size={20} fill="currentColor" className="ml-0.5" />
          )}
        </button>
        <IconButton
          onClick={() => control('skip')}
          disabled={!np}
          label="Skip to next track"
        >
          <SkipForward size={17} />
        </IconButton>
        <IconButton
          onClick={() => control('stop')}
          disabled={!np && !player?.queue.length}
          label="Stop and clear the queue"
        >
          <Square size={15} />
        </IconButton>
        <IconButton
          onClick={() => control('shuffle')}
          disabled={!player?.queue.length}
          label="Shuffle the queue"
        >
          <Shuffle size={16} />
        </IconButton>
        <IconButton
          onClick={() => void window.api.discord.setLoop(guildId, NEXT_LOOP[loop])}
          active={loop !== 'off'}
          label={LOOP_LABEL[loop]}
        >
          {loop === 'track' ? <Repeat1 size={16} /> : <Repeat size={16} />}
        </IconButton>
        <EffectsPopover />

        <div
          className="ml-auto flex shrink-0 items-center gap-3"
          title="Playback volume (remembered for this server)"
        >
          <VolumeIcon size={17} className="text-[var(--t-dim)]" />
          <input
            type="range"
            min={0}
            max={100}
            value={vol}
            onChange={(e) => setVol(Number(e.target.value))}
            onPointerUp={() => commitVolume(vol)}
            onKeyUp={() => commitVolume(vol)}
            aria-label="Volume"
            className="line-range line-range-thin w-32"
            style={{
              background: `linear-gradient(90deg, var(--t-accent) ${vol}%, var(--t-rule-strong) ${vol}%)`
            }}
          />
          <span className="w-9 shrink-0 text-right text-[13px] tabular-nums text-[var(--t-dim)]">
            {vol}%
          </span>
        </div>
      </div>
    </section>
  )
}

/** Trailing state in the meta line, shown only when playback is not simply running. */
function StatusNote({ status }: { status: PlayerStatus }): React.JSX.Element | null {
  if (status === 'paused') {
    return (
      <>
        <span aria-hidden="true">·</span>
        <span className="flex shrink-0 items-center gap-1.5 font-semibold text-[var(--t-fg)]">
          <Pause size={12} fill="currentColor" />
          Paused
        </span>
      </>
    )
  }
  if (status === 'buffering') {
    return (
      <>
        <span aria-hidden="true">·</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <Loader2 size={13} className="animate-spin text-[var(--t-blue)]" />
          Buffering
        </span>
      </>
    )
  }
  return null
}

function IconButton({
  onClick,
  children,
  active,
  disabled,
  label
}: {
  onClick: () => void
  children: React.ReactNode
  active?: boolean
  disabled?: boolean
  label: string
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`key key-line h-11 w-11 ${
        active ? 'border-[var(--w-blue)] text-[var(--t-blue)]' : ''
      }`}
    >
      {children}
    </button>
  )
}
