import { Plus } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

/**
 * Server rail on the floor. Every server carries the same furniture: square
 * tile with its icon or initials, a live dot when the bot is in voice there,
 * and the count of tracks lined up. The active server gets the blue pill and
 * ring. The plus opens the OAuth invite to add the bot to another server.
 */
export function ServerSwitcher(): React.JSX.Element | null {
  const guilds = useAppStore((s) => s.discordGuilds)
  const activeGuildId = useAppStore((s) => s.activeGuildId)
  const setActiveGuildId = useAppStore((s) => s.setActiveGuildId)
  const playerStates = useAppStore((s) => s.playerStates)
  const inviteUrl = useAppStore((s) => s.discordStatus?.inviteUrl ?? null)

  if (guilds.length === 0) return null

  return (
    <nav
      aria-label="Servers"
      className="floor flex w-[76px] shrink-0 flex-col items-center gap-4 overflow-y-auto overflow-x-hidden py-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {guilds.map((guild) => {
        const active = guild.id === activeGuildId
        const state = playerStates[guild.id]
        const inVoice = Boolean(state?.voiceChannelId)
        const lined = (state?.queue.length ?? 0) + (state?.nowPlaying ? 1 : 0)
        return (
          <div
            key={guild.id}
            className="group relative flex w-full shrink-0 flex-col items-center"
          >
            <span
              aria-hidden="true"
              className={`absolute left-0 top-6 w-1 -translate-y-1/2 bg-[var(--w-blue)] transition-[height] duration-200 ease-out ${
                active ? 'h-8' : 'h-0 group-hover:h-4'
              }`}
            />
            <button
              onClick={() => setActiveGuildId(guild.id)}
              title={guild.name}
              aria-label={guild.name}
              aria-current={active ? 'true' : undefined}
              className="relative h-12 w-12"
            >
              {guild.icon ? (
                <img
                  src={guild.icon}
                  alt=""
                  className={`h-12 w-12 rounded-sm object-cover transition-[opacity,box-shadow] duration-200 ${
                    active
                      ? 'opacity-100 shadow-[0_0_0_2px_var(--w-floor),0_0_0_4px_var(--w-blue)]'
                      : 'opacity-60 group-hover:opacity-100'
                  }`}
                />
              ) : (
                <span
                  className={`numeral flex h-12 w-12 items-center justify-center rounded-sm text-sm uppercase transition-colors duration-200 ${
                    active
                      ? 'bg-[var(--w-blue)] text-[#fff]'
                      : 'bg-[var(--t-rule)] text-[var(--t-dim)] group-hover:text-[var(--t-fg)]'
                  }`}
                >
                  {guild.name.slice(0, 2)}
                </span>
              )}
              {inVoice && (
                <span
                  title="In a voice channel"
                  className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-[var(--w-live)] ring-2 ring-[var(--t-ring)]"
                />
              )}
            </button>
            <span
              className="mt-1.5 text-[11px] tabular-nums text-[var(--t-faint)]"
              title={`${lined} ${lined === 1 ? 'track' : 'tracks'} lined up`}
            >
              {lined}
            </span>
          </div>
        )
      })}
      {inviteUrl && (
        <button
          onClick={() => void window.api.system.openExternal(inviteUrl)}
          title="Invite the bot to another server"
          aria-label="Invite the bot to another server"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-dashed border-[var(--t-rule-strong)] text-[var(--t-dim)] transition-colors hover:border-[var(--w-blue)] hover:text-[var(--t-blue)]"
        >
          <Plus size={18} />
        </button>
      )}
    </nav>
  )
}
