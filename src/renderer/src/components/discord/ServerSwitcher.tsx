import { Plus } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

/**
 * Vertical server rail (Discord-style). One icon per server the bot is in; the
 * active server gets a pill indicator and ring. The plus at the bottom opens
 * the OAuth invite to add the bot to another server.
 */
export function ServerSwitcher(): React.JSX.Element | null {
  const guilds = useAppStore((s) => s.discordGuilds)
  const activeGuildId = useAppStore((s) => s.activeGuildId)
  const setActiveGuildId = useAppStore((s) => s.setActiveGuildId)
  const playerStates = useAppStore((s) => s.playerStates)
  const inviteUrl = useAppStore((s) => s.discordStatus?.inviteUrl ?? null)

  if (guilds.length === 0) return null

  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-2 overflow-y-auto overflow-x-hidden rounded-2xl border border-white/5 bg-white/[0.015] py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {guilds.map((guild) => {
        const active = guild.id === activeGuildId
        const inVoice = Boolean(playerStates[guild.id]?.voiceChannelId)
        return (
          <div key={guild.id} className="relative flex w-full shrink-0 justify-center">
            <span
              className={`absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-indigo-400 transition-[height] duration-200 ease-out ${
                active ? 'h-7' : 'h-0 group-hover:h-3'
              }`}
            />
            <button
              onClick={() => setActiveGuildId(guild.id)}
              title={guild.name}
              aria-label={guild.name}
              className="relative h-10 w-10"
            >
              {guild.icon ? (
                <img
                  src={guild.icon}
                  alt=""
                  className={`h-10 w-10 object-cover transition-[border-radius,opacity,box-shadow] duration-200 ease-out ${
                    active
                      ? 'rounded-xl opacity-100 shadow-[0_0_0_2px_rgba(129,140,248,0.7)]'
                      : 'rounded-[20px] opacity-70 hover:rounded-xl hover:opacity-100'
                  }`}
                />
              ) : (
                <span
                  className={`flex h-10 w-10 items-center justify-center text-xs font-semibold uppercase transition-[border-radius,background-color,color,box-shadow] duration-200 ease-out ${
                    active
                      ? 'rounded-xl bg-indigo-500/25 text-indigo-100 shadow-[0_0_0_2px_rgba(129,140,248,0.7)]'
                      : 'rounded-[20px] bg-white/10 text-white/60 hover:rounded-xl hover:bg-indigo-500/15 hover:text-white'
                  }`}
                >
                  {guild.name.slice(0, 2)}
                </span>
              )}
              {inVoice && (
                <span
                  title="In a voice channel"
                  className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-[#0b0d12]"
                />
              )}
            </button>
          </div>
        )
      })}
      {inviteUrl && (
        <button
          onClick={() => void window.api.system.openExternal(inviteUrl)}
          title="Invite the bot to another server"
          aria-label="Invite the bot to another server"
          className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-[20px] border border-dashed border-white/15 text-white/40 transition-[border-radius,border-color,color] duration-200 ease-out hover:rounded-xl hover:border-indigo-400/50 hover:text-indigo-300"
        >
          <Plus size={16} />
        </button>
      )}
    </div>
  )
}
