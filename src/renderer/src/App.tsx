import { useEffect } from 'react'
import { Bell, BellOff, Download, History, KeyRound, X } from 'lucide-react'
import { useAppStore } from './stores/appStore'
import { applyTheme } from './lib/theme'
import { TitleBar } from './components/layout/TitleBar'
import { UpdateToast } from './components/layout/UpdateToast'
import { SetupGate } from './components/setup/SetupGate'
import { UrlBar } from './components/download/UrlBar'
import { MediaCard } from './components/download/MediaCard'
import { EmptyState, ResolveSkeleton } from './components/download/EmptyState'
import { DownloadQueue } from './components/download/DownloadQueue'
import { HistoryScreen } from './components/history/HistoryScreen'
import { LogsScreen } from './components/logs/LogsScreen'
import { SettingsScreen } from './components/settings/SettingsScreen'
import { DiscordScreen } from './components/discord/DiscordScreen'

function App(): React.JSX.Element {
  const binariesReady = useAppStore((s) => s.binariesReady)
  const binaries = useAppStore((s) => s.binaries)
  const view = useAppStore((s) => s.view)
  const error = useAppStore((s) => s.error)
  const info = useAppStore((s) => s.info)
  const resolving = useAppStore((s) => s.resolving)
  const searchResults = useAppStore((s) => s.searchResults)
  const theme = useAppStore((s) => s.config?.theme)
  const setConfig = useAppStore((s) => s.setConfig)
  const setBinaries = useAppStore((s) => s.setBinaries)
  const setBootstrap = useAppStore((s) => s.setBootstrap)
  const upsertJob = useAppStore((s) => s.upsertJob)
  const setJobs = useAppStore((s) => s.setJobs)
  const setHistory = useAppStore((s) => s.setHistory)
  const setLogs = useAppStore((s) => s.setLogs)
  const appendLog = useAppStore((s) => s.appendLog)
  const setAppUpdate = useAppStore((s) => s.setAppUpdate)
  const setDiscordStatus = useAppStore((s) => s.setDiscordStatus)
  const setDiscordGuilds = useAppStore((s) => s.setDiscordGuilds)
  const seedDiscord = useAppStore((s) => s.seedDiscord)
  const upsertPlayerState = useAppStore((s) => s.upsertPlayerState)
  const setAudit = useAppStore((s) => s.setAudit)

  useEffect(() => {
    void (async () => {
      // Fire all reads in parallel so the nav (gated on binaries) unlocks as
      // soon as possible instead of waiting behind config/jobs/history/logs.
      const [
        config,
        binaries,
        jobs,
        history,
        logs,
        appUpdate,
        discordStatus,
        discordGuilds
      ] = await Promise.all([
        window.api.config.get(),
        window.api.binaries.status(),
        window.api.download.list(),
        window.api.history.list(),
        window.api.logs.list(),
        window.api.appUpdate.status(),
        window.api.discord.status(),
        window.api.discord.guilds()
      ])
      setConfig(config)
      setBinaries(binaries)
      setJobs(jobs)
      setHistory(history)
      setLogs(logs)
      setAppUpdate(appUpdate)
      // Seed only if no live Discord event arrived first - the bot can reach
      // 'ready' before this batched read (gated on slow binary version probes)
      // resolves, and a stale snapshot must not revert it.
      seedDiscord(discordStatus, discordGuilds)
    })()

    const offProgress = window.api.binaries.onProgress((p) => {
      setBootstrap(p)
      if (p.stage === 'complete') {
        void window.api.binaries.status().then(setBinaries)
      }
    })
    const offJob = window.api.download.onUpdate(upsertJob)
    const offHistory = window.api.history.onChange(setHistory)
    const offLog = window.api.logs.onEntry(appendLog)
    const offUpdate = window.api.appUpdate.onStatus(setAppUpdate)
    const offDiscordStatus = window.api.discord.onStatus(setDiscordStatus)
    const offDiscordGuilds = window.api.discord.onGuilds(setDiscordGuilds)
    const offPlayer = window.api.discord.onPlayer(upsertPlayerState)
    const offAudit = window.api.discord.onAudit(setAudit)

    return () => {
      offProgress()
      offJob()
      offHistory()
      offLog()
      offUpdate()
      offDiscordStatus()
      offDiscordGuilds()
      offPlayer()
      offAudit()
    }
  }, [
    setConfig,
    setBinaries,
    setBootstrap,
    upsertJob,
    setJobs,
    setHistory,
    setLogs,
    appendLog,
    setAppUpdate,
    setDiscordStatus,
    setDiscordGuilds,
    seedDiscord,
    upsertPlayerState,
    setAudit
  ])

  useEffect(() => {
    return applyTheme(theme ?? 'system')
  }, [theme])

  return (
    <div className="flex h-screen flex-col bg-[#0b0d12] text-white">
      <TitleBar />
      <UpdateToast />
      {!binariesReady && binaries !== null ? (
        <SetupGate />
      ) : view === 'settings' ? (
        <main className="flex-1 overflow-y-auto p-5">
          <SettingsScreen />
        </main>
      ) : view === 'logs' ? (
        <main className="flex flex-1 flex-col overflow-hidden p-5">
          <LogsScreen />
        </main>
      ) : view === 'discord' ? (
        <main className="flex flex-1 flex-col overflow-hidden p-5">
          <DiscordScreen />
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <DownloaderTabs />
          {view === 'history' ? (
            <div className="flex-1 overflow-y-auto px-5 pb-5">
              <HistoryScreen />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 gap-5 overflow-hidden px-5 pb-5">
              <section className="flex min-h-0 flex-1 flex-col gap-4">
                <UrlBar />
                {error && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-sm text-red-300">
                    {error}
                  </div>
                )}
                <CookieHint />
                {resolving ? (
                  <ResolveSkeleton />
                ) : info ? (
                  <MediaCard />
                ) : searchResults.length === 0 && !error ? (
                  <EmptyState />
                ) : null}
              </section>
              <aside className="scroll-thin flex w-80 flex-col gap-3 overflow-y-auto border-l border-white/5 pl-5 pr-2">
                <div className="flex shrink-0 items-center justify-between">
                  <h2 className="text-sm font-semibold text-white/70">Downloads</h2>
                  <NotificationToggle />
                </div>
                <DownloadQueue />
              </aside>
            </div>
          )}
        </main>
      )}
    </div>
  )
}

function DownloaderTabs(): React.JSX.Element {
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)

  return (
    <div className="flex shrink-0 items-center gap-1 px-5 pb-3 pt-3">
      <SubTab
        active={view === 'downloads'}
        onClick={() => setView('downloads')}
        icon={<Download size={13} />}
        label="Download"
      />
      <SubTab
        active={view === 'history'}
        onClick={() => setView('history')}
        icon={<History size={13} />}
        label="History"
      />
    </div>
  )
}

function SubTab({
  active,
  onClick,
  icon,
  label
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-red-500/15 text-red-200 ring-1 ring-inset ring-red-500/25'
          : 'text-white/50 hover:bg-white/5 hover:text-white'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function CookieHint(): React.JSX.Element | null {
  const cookieHint = useAppStore((s) => s.cookieHint)
  const setCookieHint = useAppStore((s) => s.setCookieHint)
  const setView = useAppStore((s) => s.setView)

  if (!cookieHint) return null

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
      <KeyRound size={16} className="mt-0.5 shrink-0 text-amber-300" />
      <div className="flex-1 space-y-2">
        <p className="text-amber-200/90">
          This looks like private, age-restricted, or members-only content. Sign in by
          importing your browser cookies, then try again.
        </p>
        <button
          onClick={() => {
            setView('settings')
            setCookieHint(false)
          }}
          className="rounded-md bg-amber-500/90 px-3 py-1 text-xs font-medium text-black hover:bg-amber-400"
        >
          Set up cookies
        </button>
      </div>
      <button
        onClick={() => setCookieHint(false)}
        aria-label="Dismiss"
        className="shrink-0 rounded p-0.5 text-white/30 hover:bg-white/10 hover:text-white/70"
      >
        <X size={14} />
      </button>
    </div>
  )
}

function NotificationToggle(): React.JSX.Element {
  const notifications = useAppStore((s) => s.config?.notifications ?? true)
  const patchConfig = useAppStore((s) => s.patchConfig)

  function toggle(): void {
    const next = !notifications
    patchConfig({ notifications: next })
    void window.api.config.set({ notifications: next })
  }

  return (
    <button
      onClick={toggle}
      title={notifications ? 'Mute notifications' : 'Unmute notifications'}
      className="rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/70"
    >
      {notifications ? (
        <Bell size={14} />
      ) : (
        <BellOff size={14} className="text-red-400" />
      )}
    </button>
  )
}

export default App
