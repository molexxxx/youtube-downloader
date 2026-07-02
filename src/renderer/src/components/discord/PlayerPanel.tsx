import { useEffect, useState } from 'react'
import {
  Loader2,
  Music,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipForward,
  Square,
  Volume1,
  Volume2,
  VolumeX
} from 'lucide-react'
import type { LoopMode, PlayerControl, PlayerStatus } from '@shared/types'
import { useAppStore } from '../../stores/appStore'
import { formatClock } from '../../lib/format'

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
 * Now-playing hero: artwork, live seekable timeline, transport controls, and a
 * compact volume cluster. Volume changes apply instantly to the current track
 * and are remembered as this server's default.
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
  useEffect(() => {
    if (!player) {
      setPosition(0)
      return
    }
    const anchorMs = player.positionMs
    const anchorAt = Date.now()
    setPosition(anchorMs / 1000)
    if (player.status !== 'playing') return
    const id = window.setInterval(() => {
      setPosition((anchorMs + (Date.now() - anchorAt)) / 1000)
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
      className={`shrink-0 rounded-2xl border p-4 transition-colors ${
        np
          ? 'border-indigo-500/25 bg-indigo-500/[0.04]'
          : 'border-white/10 bg-white/[0.02]'
      }`}
    >
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-white/5">
          {np?.thumbnail ? (
            <img src={np.thumbnail} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-white/25">
              <Music size={22} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white/95">
            {np?.title ?? 'Nothing playing yet'}
          </p>
          <p className="truncate text-xs text-white/55">
            {np
              ? [np.uploader, `added by ${np.requestedBy.username}`]
                  .filter(Boolean)
                  .join(' · ')
              : 'Queue a track below, or right from your Downloads.'}
          </p>
        </div>
        <StatusChip status={status} />
      </div>

      <div className="mt-3.5 flex items-center gap-2.5">
        <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-white/45">
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
          className="slider slider-seek flex-1 disabled:cursor-default"
          style={{
            background: `linear-gradient(90deg, rgba(129,140,248,0.9) ${progressPct}%, rgba(255,255,255,0.10) ${progressPct}%)`
          }}
        />
        <span className="w-10 shrink-0 text-[11px] tabular-nums text-white/45">
          {duration ? formatClock(duration) : '--:--'}
        </span>
      </div>

      <div className="mt-2.5 flex items-center">
        <div className="flex flex-1 items-center justify-center gap-1">
          <IconButton
            onClick={() => control(playing ? 'pause' : 'resume')}
            disabled={!np}
            label={playing ? 'Pause' : 'Resume'}
            prominent
          >
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </IconButton>
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
            <Shuffle size={15} />
          </IconButton>
          <IconButton
            onClick={() => void window.api.discord.setLoop(guildId, NEXT_LOOP[loop])}
            active={loop !== 'off'}
            label={LOOP_LABEL[loop]}
          >
            {loop === 'track' ? <Repeat1 size={15} /> : <Repeat size={15} />}
          </IconButton>
        </div>
        <div
          className="flex shrink-0 items-center gap-2"
          title="Playback volume (remembered for this server)"
        >
          <VolumeIcon size={15} className="text-white/40" />
          <input
            type="range"
            min={0}
            max={100}
            value={vol}
            onChange={(e) => setVol(Number(e.target.value))}
            onPointerUp={() => commitVolume(vol)}
            onKeyUp={() => commitVolume(vol)}
            aria-label="Volume"
            className="slider w-24"
            style={{
              background: `linear-gradient(90deg, rgba(129,140,248,0.9) ${vol}%, rgba(255,255,255,0.10) ${vol}%)`
            }}
          />
          <span className="w-7 shrink-0 text-right text-[11px] tabular-nums text-white/45">
            {vol}%
          </span>
        </div>
      </div>
    </section>
  )
}

function StatusChip({ status }: { status: PlayerStatus }): React.JSX.Element {
  if (status === 'playing') {
    return (
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
        Playing
      </span>
    )
  }
  if (status === 'paused') {
    return (
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        Paused
      </span>
    )
  }
  if (status === 'buffering') {
    return (
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-300">
        <Loader2 size={11} className="animate-spin" />
        Buffering
      </span>
    )
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/40">
      <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
      Idle
    </span>
  )
}

function IconButton({
  onClick,
  children,
  active,
  disabled,
  label,
  prominent
}: {
  onClick: () => void
  children: React.ReactNode
  active?: boolean
  disabled?: boolean
  label: string
  prominent?: boolean
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`flex items-center justify-center rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-30 ${
        prominent
          ? 'h-10 w-10 bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-400 active:scale-95'
          : active
            ? 'h-9 w-9 bg-indigo-500/20 text-indigo-300'
            : 'h-9 w-9 text-white/65 hover:bg-white/10 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}
