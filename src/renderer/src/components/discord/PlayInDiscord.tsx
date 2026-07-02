import { useEffect, useRef, useState } from 'react'
import { Bot, Check } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

/**
 * "Play in Discord" row action for downloaded items. Hidden until the bot is
 * connected. One server: queues immediately. Several: opens a picker (servers
 * where the bot is already in a voice channel get a green dot). Downloaded
 * files play straight from disk - no re-streaming from YouTube.
 */
export function PlayInDiscord({
  title,
  url,
  filePath
}: {
  title: string
  url: string
  filePath?: string | null
}): React.JSX.Element | null {
  const ready = useAppStore((s) => s.discordStatus?.state === 'ready')
  const guilds = useAppStore((s) => s.discordGuilds)
  const playerStates = useAppStore((s) => s.playerStates)
  const [open, setOpen] = useState(false)
  const [queued, setQueued] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  if (!ready || guilds.length === 0) return null

  async function send(guildId: string): Promise<void> {
    setOpen(false)
    const sent = await window.api.discord.enqueue(guildId, [
      {
        title,
        url,
        duration: null,
        thumbnail: null,
        uploader: null,
        filePath: filePath ?? null
      }
    ])
    if (sent) {
      setQueued(true)
      window.setTimeout(() => setQueued(false), 2500)
    }
  }

  const click = (): void => {
    if (queued) return
    if (guilds.length === 1) {
      void send(guilds[0].id)
    } else {
      setOpen((o) => !o)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={click}
        title={queued ? 'Queued in Discord' : 'Play in Discord'}
        aria-label="Play in Discord"
        className="rounded p-1 text-white/40 transition-colors hover:text-indigo-300"
      >
        {queued ? <Check size={15} className="text-emerald-400" /> : <Bot size={15} />}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#161a22] py-1 shadow-xl shadow-black/40">
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/30">
            Queue in server
          </p>
          {guilds.map((guild) => {
            const inVoice = Boolean(playerStates[guild.id]?.voiceChannelId)
            return (
              <button
                key={guild.id}
                onClick={() => void send(guild.id)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-white/80 transition-colors hover:bg-white/5"
              >
                {guild.icon ? (
                  <img src={guild.icon} alt="" className="h-5 w-5 rounded-full" />
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold uppercase">
                    {guild.name.slice(0, 1)}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">{guild.name}</span>
                {inVoice && (
                  <span
                    title="The bot is in a voice channel here"
                    className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                  />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
