import { useEffect, useState } from 'react'
import {
  Music,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipForward,
  Square,
  Volume2
} from 'lucide-react'
import type { LoopMode, PlayerControl } from '@shared/types'
import { useAppStore } from '../../stores/appStore'
import { formatDuration } from '../../lib/format'

const NEXT_LOOP: Record<LoopMode, LoopMode> = { off: 'track', track: 'queue', queue: 'off' }

/** Now-playing card with transport controls, loop, shuffle, and live volume. */
export function PlayerPanel(): React.JSX.Element | null {
  const guildId = useAppStore((s) => s.activeGuildId)
  const player = useAppStore((s) =>
    s.activeGuildId ? (s.playerStates[s.activeGuildId] ?? null) : null
  )
  const playerVolume = player?.volume
  const [vol, setVol] = useState(playerVolume ?? 100)

  useEffect(() => {
    if (playerVolume !== undefined) setVol(playerVolume)
  }, [playerVolume])

  if (!guildId) return null

  const np = player?.nowPlaying ?? null
  const status = player?.status ?? 'idle'
  const loop = player?.loop ?? 'off'
  const playing = status === 'playing'

  const control = (action: PlayerControl): void => {
    void window.api.discord.control(guildId, action)
  }

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center gap-3">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-white/5">
          {np?.thumbnail ? (
            <img src={np.thumbnail} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-white/25">
              <Music size={20} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white/90">
            {np?.title ?? 'Nothing playing'}
          </p>
          {np?.uploader && (
            <p className="truncate text-xs text-white/55">{np.uploader}</p>
          )}
          <p className="mt-0.5 text-xs text-white/40">
            {np ? (
              <>
                {formatDuration(np.duration)} · added by {np.requestedBy.username}
              </>
            ) : (
              'Queue a track to start'
            )}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-1">
        <IconButton
          onClick={() => control(playing ? 'pause' : 'resume')}
          active={false}
          disabled={!np}
          label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </IconButton>
        <IconButton onClick={() => control('skip')} disabled={!np} label="Skip">
          <SkipForward size={18} />
        </IconButton>
        <IconButton onClick={() => control('stop')} disabled={!np && !player?.queue.length} label="Stop">
          <Square size={16} />
        </IconButton>
        <IconButton
          onClick={() => control('shuffle')}
          disabled={!player?.queue.length}
          label="Shuffle"
        >
          <Shuffle size={16} />
        </IconButton>
        <IconButton
          onClick={() => void window.api.discord.setLoop(guildId, NEXT_LOOP[loop])}
          active={loop !== 'off'}
          label={`Loop: ${loop}`}
        >
          {loop === 'track' ? <Repeat1 size={16} /> : <Repeat size={16} />}
        </IconButton>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Volume2 size={15} className="shrink-0 text-white/40" />
        <input
          type="range"
          min={0}
          max={100}
          value={vol}
          onChange={(e) => setVol(Number(e.target.value))}
          onPointerUp={() => void window.api.discord.setVolume(guildId, vol)}
          onKeyUp={() => void window.api.discord.setVolume(guildId, vol)}
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-indigo-500"
        />
        <span className="w-8 shrink-0 text-right text-xs tabular-nums text-white/50">{vol}</span>
      </div>
    </section>
  )
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
      className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        active ? 'bg-indigo-500/20 text-indigo-300' : 'text-white/70 hover:bg-white/10 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}
