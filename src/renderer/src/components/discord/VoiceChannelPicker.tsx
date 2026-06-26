import { Loader2, LogOut, Volume2 } from 'lucide-react'
import { useState } from 'react'
import { useAppStore } from '../../stores/appStore'

/** Join/leave a voice channel in the active server. */
export function VoiceChannelPicker(): React.JSX.Element | null {
  const guild = useAppStore((s) => s.discordGuilds.find((g) => g.id === s.activeGuildId) ?? null)
  const player = useAppStore((s) =>
    s.activeGuildId ? (s.playerStates[s.activeGuildId] ?? null) : null
  )
  const [busy, setBusy] = useState<string | null>(null)

  if (!guild) return null
  const connectedChannelId = player?.voiceChannelId ?? null

  async function join(channelId: string): Promise<void> {
    if (!guild) return
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
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-white/40">
          Voice channels
        </h3>
        {connectedChannelId && (
          <button
            onClick={() => void leave()}
            className="flex items-center gap-1 text-xs text-white/50 transition-colors hover:text-red-300"
          >
            {busy === 'leave' ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
            Leave
          </button>
        )}
      </div>
      {guild.voiceChannels.length === 0 ? (
        <p className="py-2 text-center text-xs text-white/30">No voice channels.</p>
      ) : (
        <ul className="scroll-thin flex max-h-96 flex-col gap-0.5 overflow-y-auto">
          {guild.voiceChannels.map((channel) => {
            const connected = channel.id === connectedChannelId
            return (
              <li key={channel.id}>
                <button
                  onClick={() => void join(channel.id)}
                  disabled={busy === channel.id}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                    connected
                      ? 'bg-emerald-500/10 text-emerald-200'
                      : 'text-white/70 hover:bg-white/[0.05]'
                  }`}
                >
                  {busy === channel.id ? (
                    <Loader2 size={14} className="shrink-0 animate-spin text-white/40" />
                  ) : (
                    <Volume2 size={14} className="shrink-0 text-white/40" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                  {connected && <span className="text-[10px] uppercase">Connected</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
