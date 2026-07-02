import { useEffect, useState } from 'react'
import { AppWindow, Bot, Download, Pin, PinOff, X } from 'lucide-react'
import type { MiniWindowSize } from '@shared/types'
import { useAppStore } from '../../stores/appStore'
import { applyTheme } from '../../lib/theme'
import { MiniDiscord } from './MiniDiscord'
import { MiniDownloads } from './MiniDownloads'

type MiniSection = 'download' | 'discord'

/**
 * Pinned quick-actions window: a compact always-on-top companion to the main
 * app with the essentials of both sections - quick downloads and Discord bot
 * control - so neither needs a trip back to the full window.
 */
export function MiniApp(): React.JSX.Element {
  const theme = useAppStore((s) => s.config?.theme)
  const setConfig = useAppStore((s) => s.setConfig)
  const setJobs = useAppStore((s) => s.setJobs)
  const upsertJob = useAppStore((s) => s.upsertJob)
  const setDiscordStatus = useAppStore((s) => s.setDiscordStatus)
  const setDiscordGuilds = useAppStore((s) => s.setDiscordGuilds)
  const seedDiscord = useAppStore((s) => s.seedDiscord)
  const upsertPlayerState = useAppStore((s) => s.upsertPlayerState)
  const [section, setSection] = useState<MiniSection>('discord')

  useEffect(() => {
    void (async () => {
      const [config, jobs, discordStatus, discordGuilds] = await Promise.all([
        window.api.config.get(),
        window.api.download.list(),
        window.api.discord.status(),
        window.api.discord.guilds()
      ])
      setConfig(config)
      setJobs(jobs)
      seedDiscord(discordStatus, discordGuilds)
    })()

    const offJob = window.api.download.onUpdate(upsertJob)
    const offStatus = window.api.discord.onStatus(setDiscordStatus)
    const offGuilds = window.api.discord.onGuilds(setDiscordGuilds)
    const offPlayer = window.api.discord.onPlayer(upsertPlayerState)
    return () => {
      offJob()
      offStatus()
      offGuilds()
      offPlayer()
    }
  }, [
    setConfig,
    setJobs,
    seedDiscord,
    upsertJob,
    setDiscordStatus,
    setDiscordGuilds,
    upsertPlayerState
  ])

  useEffect(() => {
    return applyTheme(theme ?? 'system')
  }, [theme])

  return (
    <div className="flex h-screen flex-col bg-[#0b0d12] text-white">
      <MiniTitleBar />
      <div className="flex shrink-0 gap-1 px-3 pt-2.5">
        <SectionTab
          active={section === 'download'}
          onClick={() => setSection('download')}
          icon={<Download size={13} />}
          label="Download"
          accent="red"
        />
        <SectionTab
          active={section === 'discord'}
          onClick={() => setSection('discord')}
          icon={<Bot size={13} />}
          label="Discord"
          accent="indigo"
        />
      </div>
      <main className="scroll-thin-indigo flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3">
        {section === 'download' ? <MiniDownloads /> : <MiniDiscord />}
      </main>
    </div>
  )
}

const SIZE_PRESETS: { size: MiniWindowSize; label: string; dot: string }[] = [
  { size: 'compact', label: 'Compact size', dot: 'h-1.5 w-1.5' },
  { size: 'standard', label: 'Standard size', dot: 'h-2 w-2' },
  { size: 'tall', label: 'Tall size', dot: 'h-2.5 w-2.5' }
]

function MiniTitleBar(): React.JSX.Element {
  const [pinned, setPinned] = useState(true)
  const [size, setSize] = useState<MiniWindowSize>('standard')

  async function togglePin(): Promise<void> {
    setPinned(await window.api.mini.setPinned(!pinned))
  }

  function applySize(next: MiniWindowSize): void {
    setSize(next)
    void window.api.mini.setSize(next)
  }

  return (
    <header className="drag-region flex h-9 shrink-0 items-center gap-2 border-b border-white/5 bg-[#0e1016] px-3">
      <span className="text-xs text-red-500">▶</span>
      <span className="text-xs font-semibold tracking-tight text-white/80">
        Quick Actions
      </span>
      <div className="no-drag ml-auto flex items-center gap-0.5">
        <div
          className="mr-1 flex items-center gap-1 rounded-full border border-white/10 px-2 py-1"
          role="group"
          aria-label="Window size"
        >
          {SIZE_PRESETS.map((preset) => (
            <button
              key={preset.size}
              onClick={() => applySize(preset.size)}
              title={preset.label}
              aria-label={preset.label}
              aria-pressed={size === preset.size}
              className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-white/10"
            >
              <span
                className={`rounded-full transition-colors ${preset.dot} ${
                  size === preset.size ? 'bg-indigo-400' : 'bg-white/25'
                }`}
              />
            </button>
          ))}
        </div>
        <button
          onClick={() => void togglePin()}
          title={pinned ? 'Unpin (stop floating on top)' : 'Pin on top of all windows'}
          aria-label={pinned ? 'Unpin window' : 'Pin window on top'}
          className={`rounded p-1.5 transition-colors ${
            pinned
              ? 'text-indigo-300 hover:bg-white/10'
              : 'text-white/40 hover:bg-white/10 hover:text-white'
          }`}
        >
          {pinned ? <Pin size={13} /> : <PinOff size={13} />}
        </button>
        <button
          onClick={() => void window.api.mini.focusMain()}
          title="Open the main window"
          aria-label="Open the main window"
          className="rounded p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
        >
          <AppWindow size={13} />
        </button>
        <button
          onClick={() => void window.api.mini.close()}
          title="Close quick actions"
          aria-label="Close quick actions"
          className="rounded p-1.5 text-white/60 hover:bg-red-500 hover:text-white"
        >
          <X size={13} />
        </button>
      </div>
    </header>
  )
}

const SECTION_ACCENTS = {
  red: 'bg-red-500/15 text-red-200 ring-1 ring-inset ring-red-500/25',
  indigo: 'bg-indigo-500/15 text-indigo-200 ring-1 ring-inset ring-indigo-500/25'
} as const

function SectionTab({
  active,
  onClick,
  icon,
  label,
  accent
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  accent: keyof typeof SECTION_ACCENTS
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? SECTION_ACCENTS[accent]
          : 'text-white/50 hover:bg-white/5 hover:text-white'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
