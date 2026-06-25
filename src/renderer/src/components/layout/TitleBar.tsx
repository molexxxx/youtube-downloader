import { Bot, Download, History, Minus, ScrollText, Settings, Square, X } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

export function TitleBar(): React.JSX.Element {
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const binariesReady = useAppStore((s) => s.binariesReady)
  const updateState = useAppStore((s) => s.appUpdate?.state)
  const updateReady = updateState === 'available' || updateState === 'downloaded'
  const discordReady = useAppStore((s) => s.discordStatus?.state === 'ready')

  return (
    <header className="drag-region flex h-10 items-center justify-between border-b border-white/5 bg-[#0e1016] px-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="text-red-500">▶</span>
          <span>YouTube Downloader</span>
        </div>
        {binariesReady && (
          <nav className="no-drag flex items-center gap-1">
            <NavTab
              active={view === 'downloads'}
              onClick={() => setView('downloads')}
              icon={<Download size={13} />}
              label="Downloads"
            />
            <NavTab
              active={view === 'history'}
              onClick={() => setView('history')}
              icon={<History size={13} />}
              label="History"
            />
            <NavTab
              active={view === 'discord'}
              onClick={() => setView('discord')}
              icon={<Bot size={13} />}
              label="Discord"
              dot={discordReady}
            />
            <NavTab
              active={view === 'logs'}
              onClick={() => setView('logs')}
              icon={<ScrollText size={13} />}
              label="Logs"
            />
            <NavTab
              active={view === 'settings'}
              onClick={() => setView('settings')}
              icon={<Settings size={13} />}
              label="Settings"
              badge={updateReady}
            />
          </nav>
        )}
      </div>
      <div className="no-drag flex items-center gap-1">
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

function NavTab({
  active,
  onClick,
  icon,
  label,
  badge,
  dot
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  badge?: boolean
  dot?: boolean
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
        active ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'
      }`}
    >
      {icon}
      {label}
      {badge && (
        <span
          aria-label="Update available"
          className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-[#0e1016]"
        />
      )}
      {dot && (
        <span
          aria-label="Bot connected"
          className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-[#0e1016]"
        />
      )}
    </button>
  )
}
