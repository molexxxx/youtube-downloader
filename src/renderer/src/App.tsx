import { useEffect } from 'react'
import { AlertCircle, Bell, BellOff, Download, History, KeyRound, X } from 'lucide-react'
import { useAppStore } from './stores/appStore'
import { applyTheme } from './lib/theme'
import { TitleBar } from './components/layout/TitleBar'
import { UpdateToast } from './components/layout/UpdateToast'
import { VideoPreviewModal } from './components/shared/VideoPreviewModal'
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
  const setupOpen = useAppStore((s) => s.setupOpen)
  const setupComplete = useAppStore((s) => s.config?.setupComplete)
  const view = useAppStore((s) => s.view)
  const error = useAppStore((s) => s.error)
  const info = useAppStore((s) => s.info)
  const resolving = useAppStore((s) => s.resolving)
  const searchResults = useAppStore((s) => s.searchResults)
  const theme = useAppStore((s) => s.config?.theme)
  const setConfig = useAppStore((s) => s.setConfig)
  const setBinaries = useAppStore((s) => s.setBinaries)
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

    const offBinaries = window.api.binaries.onStatus(setBinaries)
    const offJob = window.api.download.onUpdate(upsertJob)
    const offHistory = window.api.history.onChange(setHistory)
    const offLog = window.api.logs.onEntry(appendLog)
    const offUpdate = window.api.appUpdate.onStatus(setAppUpdate)
    const offDiscordStatus = window.api.discord.onStatus(setDiscordStatus)
    const offDiscordGuilds = window.api.discord.onGuilds(setDiscordGuilds)
    const offPlayer = window.api.discord.onPlayer(upsertPlayerState)
    const offAudit = window.api.discord.onAudit(setAudit)

    return () => {
      offBinaries()
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
    <div className="floor flex h-screen flex-col">
      <TitleBar />
      <UpdateToast />
      <VideoPreviewModal />
      {binaries !== null && (!binariesReady || setupOpen || setupComplete === false) ? (
        <SetupGate />
      ) : view === 'settings' ? (
        <main className="focus-ring-red signal-red stage scroll-ink scroll-centered flex-1 overflow-y-auto">
          <SettingsScreen />
        </main>
      ) : view === 'logs' ? (
        <main className="focus-ring-red signal-red stage flex min-h-0 flex-1 flex-col overflow-hidden">
          <LogsScreen />
        </main>
      ) : view === 'discord' ? (
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <DiscordScreen />
        </main>
      ) : (
        <main className="focus-ring-red signal-red stage flex min-h-0 flex-1 overflow-hidden">
          <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            <DownloaderTabs />
            {view === 'history' ? (
              <div className="scroll-ink min-h-0 flex-1 overflow-y-auto pb-10 pl-10 pr-[30px]">
                <HistoryScreen />
              </div>
            ) : (
              <div className="scroll-ink flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pb-8 pl-10 pr-[30px]">
                <UrlBar />
                {error && (
                  <p
                    role="alert"
                    className="flex items-start gap-2 text-sm text-[var(--t-red)]"
                  >
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span className="selectable min-w-0">{error}</span>
                  </p>
                )}
                <CookieHint />
                {resolving ? (
                  <ResolveSkeleton />
                ) : info ? (
                  <MediaCard />
                ) : searchResults.length === 0 && !error ? (
                  <EmptyState />
                ) : null}
              </div>
            )}
          </section>
          <aside
            aria-label="Downloads"
            className="sheet flex w-[360px] shrink-0 flex-col border-l border-[var(--t-rule)]"
          >
            <div className="flex shrink-0 items-end justify-between gap-3 px-6 pb-4 pt-6">
              <h2 className="display text-lg">Downloads</h2>
              <NotificationToggle />
            </div>
            <div className="scroll-ink min-h-0 flex-1 overflow-y-auto pb-6 pl-6 pr-[14px]">
              <DownloadQueue />
            </div>
          </aside>
        </main>
      )}
    </div>
  )
}

function DownloaderTabs(): React.JSX.Element {
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)

  return (
    <div
      role="tablist"
      aria-label="Downloader"
      className="flex shrink-0 items-center gap-6 px-10 pb-5 pt-5"
    >
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
      className={`flex items-center gap-1.5 border-b-2 py-1.5 text-[13px] font-semibold transition-colors ${
        active
          ? 'border-[var(--w-red)] text-[var(--t-fg)]'
          : 'border-transparent text-[var(--t-dim)] hover:text-[var(--t-fg)]'
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
    <div className="flex items-center gap-3 border-y border-[var(--t-rule-strong)] py-3 text-sm">
      <KeyRound size={16} className="shrink-0 text-[var(--t-warn)]" />
      <p className="min-w-0 flex-1 text-[var(--t-fg)]">
        This looks like private, age-restricted, or members-only content. Sign in by
        importing your browser cookies, then try again.
      </p>
      <button
        onClick={() => {
          setView('settings')
          setCookieHint(false)
        }}
        className="key key-line h-8 shrink-0 px-3 text-[13px]"
      >
        Set up cookies
      </button>
      <button
        onClick={() => setCookieHint(false)}
        aria-label="Dismiss"
        className="shrink-0 rounded-sm p-1 text-[var(--t-dim)] transition-colors hover:bg-[var(--t-hover)] hover:text-[var(--t-fg)]"
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
      aria-label={notifications ? 'Mute notifications' : 'Unmute notifications'}
      className="mb-1 rounded-sm p-1.5 text-[var(--t-dim)] transition-colors hover:bg-[var(--t-hover)] hover:text-[var(--t-fg)]"
    >
      {notifications ? (
        <Bell size={15} />
      ) : (
        <BellOff size={15} className="text-[var(--t-red)]" />
      )}
    </button>
  )
}

export default App
