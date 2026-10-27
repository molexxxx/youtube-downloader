import {
  Bot,
  Download,
  Minus,
  PictureInPicture2,
  Play,
  ScrollText,
  Settings,
  Square,
  X
} from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

const ICON_BUTTON =
  'rounded-sm p-1.5 text-[var(--t-dim)] transition-colors hover:bg-[var(--t-hover)] hover:text-[var(--t-fg)]'

export function TitleBar(): React.JSX.Element {
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const binariesReady = useAppStore((s) => s.binariesReady)
  const updateState = useAppStore((s) => s.appUpdate?.state)
  const updateReady = updateState === 'available' || updateState === 'downloaded'
  const discordReady = useAppStore((s) => s.discordStatus?.state === 'ready')
  const downloaderActive = view === 'downloads' || view === 'history'

  return (
    <header className="floor drag-region flex h-10 shrink-0 items-center justify-between border-b border-[var(--t-rule)] px-4">
      <div className="flex h-full items-center gap-6">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Play size={13} fill="currentColor" className="text-[var(--w-red)]" />
          <span>YouTube Downloader</span>
        </div>
        {binariesReady && (
          <nav className="no-drag flex h-full items-center gap-5">
            <PrimaryTab
              active={downloaderActive}
              onClick={() => setView('downloads')}
              icon={<Download size={14} />}
              label="Downloader"
              accent="red"
            />
            <PrimaryTab
              active={view === 'discord'}
              onClick={() => setView('discord')}
              icon={<Bot size={14} />}
              label="Discord Bot"
              accent="blue"
              dot={discordReady}
            />
          </nav>
        )}
      </div>
      <div className="no-drag flex items-center gap-1">
        {binariesReady && (
          <>
            <button
              onClick={() => void window.api.mini.open()}
              title="Pin quick actions (compact always-on-top window)"
              aria-label="Open quick actions window"
              className={ICON_BUTTON}
            >
              <PictureInPicture2 size={14} />
            </button>
            <IconTab
              active={view === 'logs'}
              onClick={() => setView('logs')}
              icon={<ScrollText size={14} />}
              label="Logs"
            />
            <IconTab
              active={view === 'settings'}
              onClick={() => setView('settings')}
              icon={<Settings size={14} />}
              label="Settings"
              badge={updateReady}
            />
            <div className="mx-1.5 h-4 w-px bg-[var(--t-rule-strong)]" />
          </>
        )}
        <button
          onClick={() => window.api.system.minimize()}
          className={ICON_BUTTON}
          aria-label="Minimize"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => window.api.system.maximize()}
          className={ICON_BUTTON}
          aria-label="Maximize"
        >
          <Square size={12} />
        </button>
        <button
          onClick={() => window.api.system.close()}
          className="rounded-sm p-1.5 text-[var(--t-dim)] transition-colors hover:bg-[var(--w-red)] hover:text-[#fff]"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>
    </header>
  )
}

const TAB_ACCENTS = {
  red: 'border-[var(--w-red)]',
  blue: 'border-[var(--w-blue)]'
} as const

function PrimaryTab({
  active,
  onClick,
  icon,
  label,
  accent,
  dot
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  accent: keyof typeof TAB_ACCENTS
  dot?: boolean
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`relative flex h-full items-center gap-1.5 border-b-2 pt-0.5 text-[13px] font-semibold transition-colors ${
        active
          ? `${TAB_ACCENTS[accent]} text-[var(--t-fg)]`
          : 'border-transparent text-[var(--t-dim)] hover:text-[var(--t-fg)]'
      }`}
    >
      {icon}
      {label}
      {dot && (
        <span
          aria-label="Bot connected"
          className="ml-0.5 h-2 w-2 rounded-full bg-[var(--w-live)]"
        />
      )}
    </button>
  )
}

function IconTab({
  active,
  onClick,
  icon,
  label,
  badge
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  badge?: boolean
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`relative rounded-sm p-1.5 transition-colors ${
        active
          ? 'bg-[var(--t-hover)] text-[var(--t-fg)]'
          : 'text-[var(--t-dim)] hover:bg-[var(--t-hover)] hover:text-[var(--t-fg)]'
      }`}
    >
      {icon}
      {badge && (
        <span
          aria-label="Update available"
          className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--w-red)] ring-2 ring-[var(--t-ring)]"
        />
      )}
    </button>
  )
}
