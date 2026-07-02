import { useEffect, useRef, useState } from 'react'
import {
  Bot,
  ChevronDown,
  ListMusic,
  Loader2,
  LogOut,
  Music,
  Pause,
  Play,
  Plus,
  Repeat,
  Repeat1,
  Search,
  SkipForward,
  Sparkles,
  Square,
  Volume2,
  X
} from 'lucide-react'
import type { LoopMode, PlayerControl, TrackInput, PlaylistEntry } from '@shared/types'
import { useAppStore } from '../../stores/appStore'
import { formatClock, formatDuration, looksLikeUrl } from '../../lib/format'
import {
  EffectsPanel,
  effectsAreActive,
  useGuildEffects
} from '../discord/EffectsPopover'

const NEXT_LOOP: Record<LoopMode, LoopMode> = {
  off: 'track',
  track: 'queue',
  queue: 'off'
}

/** Discord quick actions: server rail, transport, channel switch, and search. */
export function MiniDiscord(): React.JSX.Element {
  const status = useAppStore((s) => s.discordStatus)
  const activeGuildId = useAppStore((s) => s.activeGuildId)
  const upsertPlayerState = useAppStore((s) => s.upsertPlayerState)

  // Seed the active server's player state; live events keep it current after.
  useEffect(() => {
    if (!activeGuildId) return
    void window.api.discord.player(activeGuildId).then((state) => {
      if (state) upsertPlayerState(state)
    })
  }, [activeGuildId, upsertPlayerState])

  if (!status || status.state !== 'ready') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 p-6 text-center">
        <Bot size={22} className="text-indigo-300/70" />
        <p className="text-xs text-white/45">
          The bot isn&apos;t connected. Set it up from the main window.
        </p>
        <button
          onClick={() => void window.api.mini.focusMain()}
          className="btn btn-indigo px-3 py-1.5 text-xs"
        >
          Open the app
        </button>
      </div>
    )
  }

  return (
    <>
      <ServerRail />
      {activeGuildId ? (
        <>
          <NowPlayingCard />
          <ChannelSwitch />
          <QuickSearch />
          <UpNext />
        </>
      ) : (
        <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-white/40">
          The bot isn&apos;t in any server yet - invite it from the main window.
        </p>
      )}
    </>
  )
}

/** Compact horizontal server switcher - circles, Discord style. */
function ServerRail(): React.JSX.Element | null {
  const guilds = useAppStore((s) => s.discordGuilds)
  const activeGuildId = useAppStore((s) => s.activeGuildId)
  const setActiveGuildId = useAppStore((s) => s.setActiveGuildId)
  const playerStates = useAppStore((s) => s.playerStates)

  if (guilds.length === 0) return null

  return (
    <div className="flex shrink-0 items-center gap-2 overflow-x-auto rounded-xl border border-white/5 bg-white/[0.015] px-2.5 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {guilds.map((guild) => {
        const active = guild.id === activeGuildId
        const inVoice = Boolean(playerStates[guild.id]?.voiceChannelId)
        return (
          <button
            key={guild.id}
            onClick={() => setActiveGuildId(guild.id)}
            title={guild.name}
            aria-label={guild.name}
            aria-pressed={active}
            className="relative h-8 w-8 shrink-0"
          >
            {guild.icon ? (
              <img
                src={guild.icon}
                alt=""
                className={`h-8 w-8 object-cover transition-[border-radius,opacity,box-shadow] duration-200 ease-out ${
                  active
                    ? 'rounded-lg opacity-100 shadow-[0_0_0_2px_rgba(129,140,248,0.7)]'
                    : 'rounded-full opacity-70 hover:rounded-lg hover:opacity-100'
                }`}
              />
            ) : (
              <span
                className={`flex h-8 w-8 items-center justify-center text-[10px] font-semibold uppercase transition-[border-radius,background-color,box-shadow] duration-200 ease-out ${
                  active
                    ? 'rounded-lg bg-indigo-500/25 text-indigo-100 shadow-[0_0_0_2px_rgba(129,140,248,0.7)]'
                    : 'rounded-full bg-white/10 text-white/60 hover:rounded-lg hover:bg-indigo-500/15 hover:text-white'
                }`}
              >
                {guild.name.slice(0, 2)}
              </span>
            )}
            {inVoice && (
              <span
                title="In a voice channel"
                className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-[#0b0d12]"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

function NowPlayingCard(): React.JSX.Element | null {
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

  // Tick elapsed time between player events, anchored to the last positionMs.
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
  const playing = player?.status === 'playing'
  const loop = player?.loop ?? 'off'
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

  return (
    <section
      className={`shrink-0 rounded-xl border p-3 transition-colors ${
        np
          ? 'border-indigo-500/25 bg-indigo-500/[0.04]'
          : 'border-white/10 bg-white/[0.02]'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5">
          {np?.thumbnail ? (
            <img src={np.thumbnail} alt="" className="h-full w-full object-cover" />
          ) : (
            <Music size={15} className="text-white/25" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-white/95">
            {np?.title ?? 'Nothing playing'}
          </p>
          <p className="truncate text-[10px] text-white/45">
            {np ? (np.uploader ?? 'Unknown') : 'Queue something below.'}
          </p>
        </div>
        {playing && (
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500" />
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-white/40">
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
        <span className="w-8 shrink-0 text-[10px] tabular-nums text-white/40">
          {duration ? formatClock(duration) : '--:--'}
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-0.5">
        <MiniControl
          onClick={() => control(playing ? 'pause' : 'resume')}
          disabled={!np}
          label={playing ? 'Pause' : 'Resume'}
          prominent
        >
          {playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
        </MiniControl>
        <MiniControl onClick={() => control('skip')} disabled={!np} label="Skip">
          <SkipForward size={13} />
        </MiniControl>
        <MiniControl
          onClick={() => control('stop')}
          disabled={!np && !player?.queue.length}
          label="Stop and clear"
        >
          <Square size={11} />
        </MiniControl>
        <MiniControl
          onClick={() => void window.api.discord.setLoop(guildId, NEXT_LOOP[loop])}
          active={loop !== 'off'}
          label={`Loop: ${loop}`}
        >
          {loop === 'track' ? <Repeat1 size={13} /> : <Repeat size={13} />}
        </MiniControl>
        <MiniEffects />
        <div className="ml-auto flex min-w-0 items-center gap-1.5">
          <Volume2 size={12} className="shrink-0 text-white/40" />
          <input
            type="range"
            min={0}
            max={100}
            value={vol}
            onChange={(e) => setVol(Number(e.target.value))}
            onPointerUp={() => void window.api.discord.setVolume(guildId, vol)}
            onKeyUp={() => void window.api.discord.setVolume(guildId, vol)}
            aria-label="Volume"
            className="slider w-16"
            style={{
              background: `linear-gradient(90deg, rgba(129,140,248,0.9) ${vol}%, rgba(255,255,255,0.10) ${vol}%)`
            }}
          />
        </div>
      </div>
    </section>
  )
}

/**
 * Effects (EQ / speed / filters) for the quick window. The editor opens as a
 * full-window sheet - an anchored popover would clip inside this tiny window.
 */
function MiniEffects(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const effects = useGuildEffects()
  const active = effectsAreActive(effects)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Audio effects (EQ, speed, filters)"
        aria-label="Audio effects"
        className={`relative flex h-7 w-7 items-center justify-center rounded-full transition-all ${
          active
            ? 'bg-indigo-500/20 text-indigo-300'
            : 'text-white/60 hover:bg-white/10 hover:text-white'
        }`}
      >
        <Sparkles size={13} />
        {active && (
          <span
            aria-label="Effects active"
            className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-indigo-400 ring-2 ring-[#0b0d12]"
          />
        )}
      </button>
      {open && (
        <div
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-3 pt-12 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Audio effects"
        >
          <div className="w-full max-w-sm">
            <EffectsPanel onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  )
}

function MiniControl({
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
          ? 'h-8 w-8 bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-400 active:scale-95'
          : active
            ? 'h-7 w-7 bg-indigo-500/20 text-indigo-300'
            : 'h-7 w-7 text-white/60 hover:bg-white/10 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

/** Inline expandable voice-channel switcher (no overlay - the window is tiny). */
function ChannelSwitch(): React.JSX.Element | null {
  const guild = useAppStore(
    (s) => s.discordGuilds.find((g) => g.id === s.activeGuildId) ?? null
  )
  const player = useAppStore((s) =>
    s.activeGuildId ? (s.playerStates[s.activeGuildId] ?? null) : null
  )
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  if (!guild) return null
  const connectedId = player?.voiceChannelId ?? null
  const connected = guild.voiceChannels.find((c) => c.id === connectedId) ?? null

  async function join(channelId: string): Promise<void> {
    if (!guild || channelId === connectedId) return
    setBusy(channelId)
    try {
      await window.api.discord.join(guild.id, channelId)
      setOpen(false)
    } finally {
      setBusy(null)
    }
  }

  async function leave(): Promise<void> {
    if (!guild) return
    setBusy('leave')
    try {
      await window.api.discord.leave(guild.id)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/[0.03]"
      >
        <Volume2
          size={13}
          className={`shrink-0 ${connected ? 'text-emerald-300' : 'text-white/40'}`}
        />
        <span
          className={`min-w-0 flex-1 truncate text-xs ${
            connected ? 'text-emerald-200' : 'text-white/60'
          }`}
        >
          {connected ? connected.name : 'Join a voice channel…'}
        </span>
        {connected && (
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400" />
        )}
        <ChevronDown
          size={13}
          className={`shrink-0 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="border-t border-white/5">
          {guild.voiceChannels.length === 0 ? (
            <p className="px-3 py-2 text-center text-[11px] text-white/30">
              No voice channels in this server.
            </p>
          ) : (
            <ul className="scroll-thin-indigo max-h-36 overflow-y-auto p-1">
              {guild.voiceChannels.map((channel) => {
                const isConnected = channel.id === connectedId
                return (
                  <li key={channel.id}>
                    <button
                      onClick={() => void join(channel.id)}
                      disabled={busy === channel.id}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                        isConnected
                          ? 'bg-emerald-500/10 text-emerald-200'
                          : 'text-white/70 hover:bg-white/[0.05] hover:text-white'
                      }`}
                    >
                      {busy === channel.id ? (
                        <Loader2
                          size={12}
                          className="shrink-0 animate-spin text-white/40"
                        />
                      ) : (
                        <Volume2
                          size={12}
                          className={`shrink-0 ${isConnected ? 'text-emerald-300' : 'text-white/35'}`}
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {connected && (
            <button
              onClick={() => void leave()}
              className="flex w-full items-center justify-center gap-1.5 border-t border-white/5 py-1.5 text-[11px] text-white/45 transition-colors hover:text-red-300"
            >
              {busy === 'leave' ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <LogOut size={11} />
              )}
              Leave channel
            </button>
          )}
        </div>
      )}
    </section>
  )
}

/** Search YouTube or paste a link; results queue with a tap. */
function QuickSearch(): React.JSX.Element | null {
  const guildId = useAppStore((s) => s.activeGuildId)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<PlaylistEntry[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const noticeTimer = useRef<number | null>(null)

  if (!guildId) return null

  function flash(message: string): void {
    setNotice(message)
    setError(null)
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3000)
  }

  async function enqueue(inputs: TrackInput[], label: string): Promise<void> {
    if (inputs.length === 0) return
    await window.api.discord.enqueue(guildId!, inputs)
    flash(label)
  }

  async function submit(): Promise<void> {
    const q = query.trim()
    if (!q) return
    setBusy(true)
    setError(null)
    try {
      if (looksLikeUrl(q)) {
        setResults([])
        const info = await window.api.extract.info(q)
        const inputs = info.isPlaylist
          ? info.entries
              .filter((e) => e.url)
              .map((e) => ({
                title: e.title,
                url: e.url,
                duration: e.duration,
                thumbnail: e.thumbnail,
                uploader: e.uploader
              }))
          : [
              {
                title: info.title,
                url: info.webpageUrl || q,
                duration: info.duration,
                thumbnail: info.thumbnail,
                uploader: info.uploader
              }
            ]
        await enqueue(
          inputs,
          info.isPlaylist ? `Added ${inputs.length} tracks` : `Added “${info.title}”`
        )
        setQuery('')
      } else {
        const found = await window.api.extract.search(q, 8)
        setResults(found)
        if (found.length === 0) setError('No results for that search.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="shrink-0 space-y-1.5">
      <div className="field field-indigo group flex items-center gap-2 px-3 py-2">
        <Search
          size={14}
          className="shrink-0 text-white/40 group-focus-within:text-indigo-400/80"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          placeholder="Search or paste a link to queue…"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-xs text-white/90 outline-none placeholder:text-white/30"
        />
        {busy ? (
          <Loader2 size={13} className="shrink-0 animate-spin text-indigo-300" />
        ) : query ? (
          <button
            onClick={() => {
              setQuery('')
              setResults([])
            }}
            title="Clear"
            aria-label="Clear search"
            className="shrink-0 rounded p-0.5 text-white/30 transition-colors hover:bg-white/10 hover:text-white/70"
          >
            <X size={12} />
          </button>
        ) : null}
      </div>

      {(notice || error) && (
        <p
          className={`rounded-lg border px-2.5 py-1 text-[11px] ${
            notice
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/25 bg-red-500/10 text-red-300'
          }`}
        >
          {notice ?? error}
        </p>
      )}

      {results.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
          <div className="flex items-center justify-between border-b border-white/5 px-2.5 py-1.5">
            <span className="text-[11px] text-white/40">Tap a result to queue it</span>
            <button
              onClick={() => setResults([])}
              className="text-[11px] text-white/40 transition-colors hover:text-white/70"
            >
              Clear
            </button>
          </div>
          <ul className="scroll-thin-indigo max-h-48 divide-y divide-white/5 overflow-y-auto">
            {results.map((entry) => (
              <li key={entry.id}>
                <button
                  onClick={() =>
                    void enqueue(
                      [
                        {
                          title: entry.title,
                          url: entry.url,
                          duration: entry.duration,
                          thumbnail: entry.thumbnail,
                          uploader: entry.uploader
                        }
                      ],
                      `Added “${entry.title}”`
                    )
                  }
                  className="group flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
                >
                  <span className="relative shrink-0 overflow-hidden rounded">
                    {entry.thumbnail ? (
                      <img
                        src={entry.thumbnail}
                        alt=""
                        className="h-7 w-12 object-cover"
                      />
                    ) : (
                      <span className="flex h-7 w-12 items-center justify-center bg-white/5">
                        <Play size={11} className="text-white/30" />
                      </span>
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <Plus size={12} className="text-white" />
                    </span>
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-white/80 group-hover:text-white">
                    {entry.title}
                  </span>
                  {entry.duration ? (
                    <span className="shrink-0 text-[10px] tabular-nums text-white/40">
                      {formatDuration(entry.duration)}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/** Compact peek at what's queued next. */
function UpNext(): React.JSX.Element | null {
  const player = useAppStore((s) =>
    s.activeGuildId ? (s.playerStates[s.activeGuildId] ?? null) : null
  )
  const queue = player?.queue ?? []
  if (queue.length === 0) return null

  return (
    <section className="shrink-0 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/40">
        <ListMusic size={11} />
        Up next · {queue.length}
      </p>
      <ul className="mt-1.5 space-y-1">
        {queue.slice(0, 3).map((track, i) => (
          <li key={track.id} className="flex items-center gap-2 text-xs">
            <span className="w-3 shrink-0 text-right tabular-nums text-white/30">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-white/70">{track.title}</span>
            <span className="shrink-0 text-[10px] tabular-nums text-white/35">
              {formatDuration(track.duration)}
            </span>
          </li>
        ))}
        {queue.length > 3 && (
          <li className="pl-5 text-[11px] text-white/30">…and {queue.length - 3} more</li>
        )}
      </ul>
    </section>
  )
}
