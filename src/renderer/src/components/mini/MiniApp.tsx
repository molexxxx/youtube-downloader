import { useEffect, useState } from 'react'
import { AppWindow, Bot, Download, Pin, PinOff, X } from 'lucide-react'
import type { MiniWindowSize } from '@shared/types'
import { useAppStore } from '../../stores/appStore'
import { applyTheme } from '../../lib/theme'
import { BrandMark } from '../shared/BrandMark'
import { MiniDiscord } from './MiniDiscord'
import { MiniDownloads } from './MiniDownloads'

type MiniSection = 'download' | 'discord'

const ICON_BUTTON =
  'rounded-sm p-1.5 text-[var(--t-dim)] transition-colors hover:bg-[var(--t-hover)] hover:text-[var(--t-fg)]'

/**
 * Pinned quick-actions window: a compact always-on-top companion to the main
 * app with the essentials of both sections - quick downloads and Discord bot
 * control - so neither needs a trip back to the full window. Each section is
 * a stage for its controls above a sheet of what is lined up.
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
    <div className="floor flex h-screen flex-col">
      <MiniTitleBar />
      <div
        role="tablist"
        aria-label="Quick actions"
        className="flex shrink-0 gap-5 border-b border-[var(--t-rule)] px-4"
      >
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
          accent="blue"
        />
      </div>
      <main
        className={`${
          section === 'download'
            ? 'focus-ring-red signal-red'
            : 'focus-ring-indigo signal-blue'
        } stage scroll-ink flex min-h-0 flex-1 flex-col overflow-y-auto`}
      >
        {section === 'download' ? <MiniDownloads /> : <MiniDiscord />}
      </main>
    </div>
  )
}

const SIZE_PRESETS: { size: MiniWindowSize; label: string; mark: string }[] = [
  { size: 'compact', label: 'Compact size', mark: 'h-1.5 w-1.5' },
  { size: 'standard', label: 'Standard size', mark: 'h-2 w-2' },
  { size: 'tall', label: 'Tall size', mark: 'h-2.5 w-2.5' }
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
    <header className="drag-region flex h-9 shrink-0 items-center gap-2 px-3">
      <BrandMark size={14} />
      <span className="text-xs font-semibold tracking-tight">Quick Actions</span>
      <div className="no-drag ml-auto flex items-center gap-0.5">
        <div
          className="mr-1 flex items-center gap-0.5"
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
              className="flex h-6 w-6 items-center justify-center rounded-sm transition-colors hover:bg-[var(--t-hover)]"
            >
              <span
                className={`transition-colors ${preset.mark} ${
                  size === preset.size
                    ? 'bg-[var(--w-blue)]'
                    : 'bg-[var(--t-rule-strong)]'
                }`}
              />
            </button>
          ))}
        </div>
        <button
          onClick={() => void togglePin()}
          title={pinned ? 'Unpin (stop floating on top)' : 'Pin on top of all windows'}
          aria-label={pinned ? 'Unpin window' : 'Pin window on top'}
          aria-pressed={pinned}
          className={`rounded-sm p-1.5 transition-colors hover:bg-[var(--t-hover)] ${
            pinned
              ? 'text-[var(--t-blue)]'
              : 'text-[var(--t-dim)] hover:text-[var(--t-fg)]'
          }`}
        >
          {pinned ? <Pin size={13} /> : <PinOff size={13} />}
        </button>
        <button
          onClick={() => void window.api.mini.focusMain()}
          title="Open the main window"
          aria-label="Open the main window"
          className={ICON_BUTTON}
        >
          <AppWindow size={13} />
        </button>
        <button
          onClick={() => void window.api.mini.close()}
          title="Close quick actions"
          aria-label="Close quick actions"
          className="rounded-sm p-1.5 text-[var(--t-dim)] transition-colors hover:bg-[var(--w-red)] hover:text-[#fff]"
        >
          <X size={13} />
        </button>
      </div>
    </header>
  )
}

const SECTION_ACCENTS = {
  red: 'border-[var(--w-red)]',
  blue: 'border-[var(--w-blue)]'
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
      className={`flex items-center gap-1.5 border-b-2 py-2.5 text-[13px] font-semibold transition-colors ${
        active
          ? `${SECTION_ACCENTS[accent]} text-[var(--t-fg)]`
          : 'border-transparent text-[var(--t-dim)] hover:text-[var(--t-fg)]'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
