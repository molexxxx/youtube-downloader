import { useAppStore } from '../../stores/appStore'

/** Horizontal list of servers the bot is in; selects the active one. */
export function ServerSwitcher(): React.JSX.Element | null {
  const guilds = useAppStore((s) => s.discordGuilds)
  const activeGuildId = useAppStore((s) => s.activeGuildId)
  const setActiveGuildId = useAppStore((s) => s.setActiveGuildId)

  if (guilds.length === 0) return null

  return (
    <div className="scroll-thin flex shrink-0 gap-2 overflow-x-auto pb-1">
      {guilds.map((guild) => {
        const active = guild.id === activeGuildId
        return (
          <button
            key={guild.id}
            onClick={() => setActiveGuildId(guild.id)}
            className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              active
                ? 'border-indigo-500/50 bg-indigo-500/10 text-white'
                : 'border-white/10 bg-white/[0.02] text-white/60 hover:bg-white/[0.05] hover:text-white/90'
            }`}
          >
            {guild.icon ? (
              <img src={guild.icon} alt="" className="h-5 w-5 rounded-full" />
            ) : (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold uppercase">
                {guild.name.slice(0, 1)}
              </span>
            )}
            <span className="max-w-[160px] truncate">{guild.name}</span>
          </button>
        )
      })}
    </div>
  )
}
