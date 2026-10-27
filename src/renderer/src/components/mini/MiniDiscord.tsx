import { useEffect, useRef, useState } from 'react'
import {
  Bot,
  CheckCircle2,
  ChevronDown,
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

/**
 * Discord quick actions: server switcher, now playing with the transport,
 * channel switch, and search up top; the queue below a rule.
 */
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
      <section className="flex flex-1 flex-col justify-center gap-3 py-5 pl-5 pr-2.5">
        <Bot size={22} className="text-[var(--t-blue)]" />
        <p className="text-sm text-[var(--t-dim)]">
          The bot isn&apos;t connected. Set it up from the main window.
        </p>
        <button
          onClick={() => void window.api.mini.focusMain()}
          className="key key-blue h-9 self-start px-4 text-[13px]"
        >
          Open the app
        </button>
      </section>
    )
  }

  return (
    <>
      <section className="shrink-0 space-y-4 py-4 pl-4 pr-1.5">
        <ServerRail />
        {activeGuildId ? (
          <>
            <NowPlayingCard />
            <ChannelSwitch />
            <QuickSearch />
          </>
        ) : (
          <p className="text-sm text-[var(--t-dim)]">
            The bot isn&apos;t in any server yet - invite it from the main window.
          </p>
        )}
      </section>
      {activeGuildId && <UpNext />}
    </>
  )
}

/** Compact horizontal server switcher of square tiles. */
function ServerRail(): React.JSX.Element | null {
  const guilds = useAppStore((s) => s.discordGuilds)
  const activeGuildId = useAppStore((s) => s.activeGuildId)
  const setActiveGuildId = useAppStore((s) => s.setActiveGuildId)
  const playerStates = useAppStore((s) => s.playerStates)

  if (guilds.length === 0) return null

  return (
    <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                className={`h-8 w-8 rounded-sm object-cover transition-[opacity,box-shadow] duration-200 ${
                  active
                    ? 'opacity-100 shadow-[0_0_0_2px_var(--w-stage),0_0_0_4px_var(--w-blue)]'
                    : 'opacity-60 hover:opacity-100'
                }`}
              />
            ) : (
              <span
                className={`numeral flex h-8 w-8 items-center justify-center rounded-sm text-[11px] uppercase transition-colors duration-200 ${
                  active
                    ? 'bg-[var(--w-blue)] text-[#fff]'
                    : 'bg-[var(--t-rule)] text-[var(--t-dim)] hover:text-[var(--t-fg)]'
                }`}
              >
                {guild.name.slice(0, 2)}
              </span>
            )}
            {inVoice && (
              <span
                title="In a voice channel"
                className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[var(--w-live)] ring-2 ring-[var(--t-ring)]"
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
    <section aria-label="Now playing">
      <div className="flex items-center gap-3">
        <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-sm bg-[var(--t-rule)]">
          {np?.thumbnail ? (
            <img src={np.thumbnail} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[var(--t-faint)]">
              <Music size={18} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={`display line-clamp-2 text-sm ${
              np ? '' : 'text-[var(--t-faint)]'
            }`}
            title={np?.title}
          >
            {np?.title ?? 'Nothing playing'}
          </p>
          <p className="mt-1 truncate text-xs text-[var(--t-dim)]">
            {np ? (np.uploader ?? 'Unknown') : 'Queue something below.'}
            {player?.status === 'paused' && ' · Paused'}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="w-8 shrink-0 text-[11px] tabular-nums text-[var(--t-dim)]">
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
          className="line-range line-range-thin min-w-0 flex-1"
          style={{
            background: `linear-gradient(90deg, var(--t-accent) ${progressPct}%, var(--t-rule-strong) ${progressPct}%)`
          }}
        />
        <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-[var(--t-dim)]">
          {duration ? formatClock(duration) : '--:--'}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <button
          onClick={() => control(playing ? 'pause' : 'resume')}
          disabled={!np}
          title={playing ? 'Pause' : 'Resume'}
          aria-label={playing ? 'Pause' : 'Resume'}
          className="key key-blue mr-1 h-9 w-9"
        >
          {playing ? (
            <Pause size={15} fill="currentColor" />
          ) : (
            <Play size={15} fill="currentColor" className="ml-0.5" />
          )}
        </button>
        <MiniControl onClick={() => control('skip')} disabled={!np} label="Skip">
          <SkipForward size={14} />
        </MiniControl>
        <MiniControl
          onClick={() => control('stop')}
          disabled={!np && !player?.queue.length}
          label="Stop and clear"
        >
          <Square size={12} />
        </MiniControl>
        <MiniControl
          onClick={() => void window.api.discord.setLoop(guildId, NEXT_LOOP[loop])}
          active={loop !== 'off'}
          label={`Loop: ${loop}`}
        >
          {loop === 'track' ? <Repeat1 size={14} /> : <Repeat size={14} />}
        </MiniControl>
        <MiniEffects />
        <div className="ml-auto flex min-w-0 items-center gap-1.5">
          <Volume2 size={13} className="shrink-0 text-[var(--t-dim)]" />
          <input
            type="range"
            min={0}
            max={100}
            value={vol}
            onChange={(e) => setVol(Number(e.target.value))}
            onPointerUp={() => void window.api.discord.setVolume(guildId, vol)}
            onKeyUp={() => void window.api.discord.setVolume(guildId, vol)}
            aria-label="Volume"
            className="line-range line-range-thin w-16"
            style={{
              background: `linear-gradient(90deg, var(--t-accent) ${vol}%, var(--t-rule-strong) ${vol}%)`
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
      <MiniControl onClick={() => setOpen(true)} active={active} label="Audio effects">
        <Sparkles size={14} />
      </MiniControl>
      {open && (
        <div
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
          className="scroll-ink fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 pb-3 pl-3 pr-[2px] pt-12"
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
      className={`key key-line h-8 w-8 ${
        active ? 'border-[var(--w-blue)] text-[var(--t-blue)]' : ''
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
    <section aria-label="Voice channel" className="border-y border-[var(--t-rule)]">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 py-2 text-left"
      >
        {connected ? (
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--w-live)]" />
        ) : (
          <Volume2 size={13} className="shrink-0 text-[var(--t-dim)]" />
        )}
        <span
          className={`min-w-0 flex-1 truncate text-[13px] ${
            connected ? 'font-semibold text-[var(--t-blue)]' : 'text-[var(--t-dim)]'
          }`}
        >
          {connected ? connected.name : 'Join a voice channel…'}
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-[var(--t-dim)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="pb-2">
          {guild.voiceChannels.length === 0 ? (
            <p className="py-1 text-xs text-[var(--t-dim)]">
              No voice channels in this server.
            </p>
          ) : (
            <ul className="scroll-ink scroll-centered max-h-36 overflow-y-auto">
              {guild.voiceChannels.map((channel) => {
                const isConnected = channel.id === connectedId
                return (
                  <li key={channel.id}>
                    <button
                      onClick={() => void join(channel.id)}
                      disabled={busy === channel.id}
                      className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors ${
                        isConnected
                          ? 'font-semibold text-[var(--t-blue)]'
                          : 'text-[var(--t-dim)] hover:bg-[var(--t-hover)] hover:text-[var(--t-fg)]'
                      }`}
                    >
                      {busy === channel.id ? (
                        <Loader2 size={12} className="shrink-0 animate-spin" />
                      ) : (
                        <Volume2 size={12} className="shrink-0" />
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
              className="mt-1 flex items-center gap-1.5 px-2 py-1 text-xs text-[var(--t-dim)] transition-colors hover:text-[var(--t-red)]"
            >
              {busy === 'leave' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <LogOut size={12} />
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
    <section className="space-y-2">
      <div className="line-field line-field-blue group pb-2">
        <Search
          size={14}
          className="shrink-0 text-[var(--t-faint)] transition-colors group-focus-within:text-[var(--t-blue)]"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          placeholder="Search or paste a link to queue…"
          aria-label="Search or link to queue"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        {busy ? (
          <Loader2 size={13} className="shrink-0 animate-spin text-[var(--t-blue)]" />
        ) : query ? (
          <button
            onClick={() => {
              setQuery('')
              setResults([])
            }}
            title="Clear"
            aria-label="Clear search"
            className="shrink-0 rounded-sm p-0.5 text-[var(--t-dim)] transition-colors hover:bg-[var(--t-hover)] hover:text-[var(--t-fg)]"
          >
            <X size={13} />
          </button>
        ) : null}
      </div>

      {(notice || error) && (
        <p
          role={error ? 'alert' : 'status'}
          className={`flex items-center gap-1.5 text-xs ${
            notice ? 'text-[var(--t-fg)]' : 'text-[var(--t-red)]'
          }`}
        >
          {notice && <CheckCircle2 size={13} className="shrink-0 text-[var(--w-live)]" />}
          {notice ?? error}
        </p>
      )}

      {results.length > 0 && (
        <div className="sheet rounded-sm">
          <div className="flex items-center justify-between border-b border-[var(--t-rule-strong)] px-3 py-2">
            <span className="text-xs text-[var(--t-dim)]">Tap a result to queue it</span>
            <button
              onClick={() => setResults([])}
              className="text-xs text-[var(--t-dim)] transition-colors hover:text-[var(--t-fg)]"
            >
              Clear
            </button>
          </div>
          <ul className="scroll-ink max-h-48 overflow-y-auto">
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
                  className="group flex w-full items-center gap-2 border-b border-[var(--t-rule)] py-1.5 pl-3 pr-[2px] text-left transition-colors hover:bg-[var(--t-hover)]"
                >
                  <span className="relative shrink-0 overflow-hidden rounded-sm">
                    {entry.thumbnail ? (
                      <img
                        src={entry.thumbnail}
                        alt=""
                        loading="lazy"
                        className="aspect-video w-12 object-cover"
                      />
                    ) : (
                      <span className="flex aspect-video w-12 items-center justify-center bg-[var(--t-rule)]">
                        <Play size={11} className="text-[var(--t-faint)]" />
                      </span>
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-[var(--w-blue)]/80 opacity-0 transition-opacity group-hover:opacity-100">
                      <Plus size={12} className="text-white" />
                    </span>
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                    {entry.title}
                  </span>
                  {entry.duration ? (
                    <span className="shrink-0 text-[11px] tabular-nums text-[var(--t-dim)]">
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

/** The queue below the controls, numbered. */
function UpNext(): React.JSX.Element {
  const player = useAppStore((s) =>
    s.activeGuildId ? (s.playerStates[s.activeGuildId] ?? null) : null
  )
  const queue = player?.queue ?? []

  return (
    <section
      aria-label="Up next"
      className="min-h-[140px] flex-1 border-t border-[var(--t-rule-strong)] py-3 pl-4 pr-1.5"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="display text-[13px]">Up next</h2>
        <span className="text-xs tabular-nums text-[var(--t-dim)]">
          {queue.length} {queue.length === 1 ? 'track' : 'tracks'}
        </span>
      </div>
      {queue.length === 0 ? (
        <p className="mt-2 border-t border-[var(--t-rule-strong)] pt-2.5 text-xs text-[var(--t-dim)]">
          The queue is empty.
        </p>
      ) : (
        <ol className="mt-2 border-t border-[var(--t-rule-strong)]">
          {queue.map((track, i) => (
            <li
              key={track.id}
              className="flex items-center gap-2.5 border-b border-[var(--t-rule)] py-1.5 text-xs"
            >
              <span className="numeral w-5 shrink-0 text-right text-[11px] text-[var(--t-dim)]">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold" title={track.title}>
                {track.title}
              </span>
              <span className="shrink-0 tabular-nums text-[var(--t-dim)]">
                {formatDuration(track.duration)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
