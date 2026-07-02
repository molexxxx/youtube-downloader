import { Bot, Download, Minus, ScrollText, Settings, Square, X } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

export function TitleBar(): React.JSX.Element {
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const binariesReady = useAppStore((s) => s.binariesReady)
  const updateState = useAppStore((s) => s.appUpdate?.state)
  const updateReady = updateState === 'available' || updateState === 'downloaded'
  const discordReady = useAppStore((s) => s.discordStatus?.state === 'ready')
  const downloaderActive = view === 'downloads' || view === 'history'

  return (
    <header className="drag-region flex h-10 items-center justify-between border-b border-white/5 bg-[#0e1016] px-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="text-red-500">▶</span>
          <span>YouTube Downloader</span>
        </div>
        {binariesReady && (
          <nav className="no-drag flex items-center gap-1.5">
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
              accent="indigo"
              dot={discordReady}
            />
          </nav>
        )}
      </div>
      <div className="no-drag flex items-center gap-1">
        {binariesReady && (
          <>
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
            <div className="mx-1.5 h-4 w-px bg-white/10" />
          </>
        )}
        <button
          onClick={() => window.api.system.minimize()}
          className="rounded p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="Minimize"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => window.api.system.maximize()}
          className="rounded p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="Maximize"
        >
          <Square size={12} />
        </button>
        <button
          onClick={() => window.api.system.close()}
          className="rounded p-1.5 text-white/60 hover:bg-red-500 hover:text-white"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>
    </header>
  )
}

const TAB_ACCENTS = {
  red: 'bg-red-500/15 text-red-100 ring-1 ring-inset ring-red-500/30',
  indigo: 'bg-indigo-500/15 text-indigo-100 ring-1 ring-inset ring-indigo-500/30'
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
      className={`relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? TAB_ACCENTS[accent] : 'text-white/50 hover:bg-white/5 hover:text-white'
      }`}
    >
      {icon}
      {label}
      {dot && (
        <span
          aria-label="Bot connected"
          className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-[#0e1016]"
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
      className={`relative rounded p-1.5 ${
        active
          ? 'bg-white/10 text-white'
          : 'text-white/60 hover:bg-white/10 hover:text-white'
      }`}
    >
      {icon}
      {badge && (
        <span
          aria-label="Update available"
          className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-[#0e1016]"
        />
      )}
    </button>
  )
}
