import { Loader2, LogOut, Volume2 } from 'lucide-react'
import { useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import { Select } from '../shared/Select'

/** Above this many channels the inline row becomes a dropdown. */
const INLINE_LIMIT = 5

/**
 * Join or leave a voice channel in the active server, along the stage's foot.
 * A few channels sit inline; larger servers get a dropdown instead.
 */
export function VoiceChannelPicker(): React.JSX.Element | null {
  const guild = useAppStore(
    (s) => s.discordGuilds.find((g) => g.id === s.activeGuildId) ?? null
  )
  const player = useAppStore((s) =>
    s.activeGuildId ? (s.playerStates[s.activeGuildId] ?? null) : null
  )
  const [busy, setBusy] = useState<string | null>(null)

  if (!guild) return null
  const connectedChannelId = player?.voiceChannelId ?? null

  async function join(channelId: string): Promise<void> {
    if (!guild || channelId === connectedChannelId) return
    setBusy(channelId)
    try {
      await window.api.discord.join(guild.id, channelId)
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
    <section
      aria-label="Voice channels"
      className="mt-auto flex shrink-0 flex-wrap items-center gap-x-1 gap-y-2 border-t border-[var(--t-rule)] pt-4"
    >
      <span className="mr-3 text-[13px] font-semibold text-[var(--t-dim)]">Voice</span>
      {guild.voiceChannels.length === 0 ? (
        <span className="text-sm text-[var(--t-dim)]">
          No voice channels in this server.
        </span>
      ) : guild.voiceChannels.length > INLINE_LIMIT ? (
        <div className="flex items-center gap-3">
          <Select
            ariaLabel="Voice channel"
            accent="indigo"
            className="w-72"
            value={connectedChannelId ?? ''}
            placeholder="Pick a voice channel"
            onChange={(id) => void join(id)}
            options={guild.voiceChannels.map((c) => ({ value: c.id, label: c.name }))}
          />
          {busy && busy !== 'leave' ? (
            <Loader2 size={14} className="animate-spin text-[var(--t-dim)]" />
          ) : connectedChannelId ? (
            <span className="flex items-center gap-1.5 text-[13px] text-[var(--t-dim)]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--w-live)]" />
              Connected
            </span>
          ) : null}
        </div>
      ) : (
        guild.voiceChannels.map((channel) => {
          const connected = channel.id === connectedChannelId
          return (
            <button
              key={channel.id}
              onClick={() => void join(channel.id)}
              disabled={busy === channel.id}
              aria-current={connected ? 'true' : undefined}
              title={connected ? 'The bot is playing here' : `Join ${channel.name}`}
              className={`flex max-w-[220px] items-center gap-2 border-b-2 px-3 py-1.5 text-sm transition-colors ${
                connected
                  ? 'border-[var(--w-blue)] font-semibold text-[var(--t-blue)]'
                  : 'border-transparent text-[var(--t-dim)] hover:text-[var(--t-fg)]'
              }`}
            >
              {busy === channel.id ? (
                <Loader2 size={14} className="shrink-0 animate-spin" />
              ) : connected ? (
                <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--w-live)]" />
              ) : (
                <Volume2 size={14} className="shrink-0" />
              )}
              <span className="min-w-0 truncate">{channel.name}</span>
            </button>
          )
        })
      )}
      {connectedChannelId && (
        <button
          onClick={() => void leave()}
          className="ml-auto flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-[13px] text-[var(--t-dim)] transition-colors hover:text-[var(--t-red)]"
        >
          {busy === 'leave' ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <LogOut size={13} />
          )}
          Leave channel
        </button>
      )}
    </section>
  )
}
