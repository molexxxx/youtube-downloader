import { useEffect } from 'react'
import { KeyRound, X } from 'lucide-react'
import { useAppStore } from './stores/appStore'
import { applyTheme } from './lib/theme'
import { TitleBar } from './components/layout/TitleBar'
import { SetupGate } from './components/setup/SetupGate'
import { UrlBar } from './components/download/UrlBar'
import { MediaCard } from './components/download/MediaCard'
import { EmptyState, ResolveSkeleton } from './components/download/EmptyState'
import { DownloadQueue } from './components/download/DownloadQueue'
import { HistoryScreen } from './components/history/HistoryScreen'
import { LogsScreen } from './components/logs/LogsScreen'
import { SettingsScreen } from './components/settings/SettingsScreen'

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

  useEffect(() => {
    void (async () => {
      // Fire all reads in parallel so the nav (gated on binaries) unlocks as
      // soon as possible instead of waiting behind config/jobs/history/logs.
      const [config, binaries, jobs, history, logs, appUpdate] = await Promise.all([
        window.api.config.get(),
        window.api.binaries.status(),
        window.api.download.list(),
        window.api.history.list(),
        window.api.logs.list(),
        window.api.appUpdate.status()
      ])
      setConfig(config)
      setBinaries(binaries)
      setJobs(jobs)
      setHistory(history)
      setLogs(logs)
      setAppUpdate(appUpdate)
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

    return () => {
      offProgress()
      offJob()
      offHistory()
      offLog()
      offUpdate()
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
    setAppUpdate
  ])

  useEffect(() => {
    return applyTheme(theme ?? 'system')
  }, [theme])

  return (
    <div className="flex h-screen flex-col bg-[#0b0d12] text-white">
      <TitleBar />
      {!binariesReady && binaries !== null ? (
        <SetupGate />
      ) : view === 'settings' ? (
        <main className="flex-1 overflow-y-auto p-5">
          <SettingsScreen />
        </main>
      ) : view === 'history' ? (
        <main className="flex-1 overflow-y-auto p-5">
          <HistoryScreen />
        </main>
      ) : view === 'logs' ? (
        <main className="flex flex-1 flex-col overflow-hidden p-5">
          <LogsScreen />
        </main>
      ) : (
        <main className="flex flex-1 gap-5 overflow-hidden p-5">
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
          <aside className="scroll-thin flex w-80 flex-col gap-3 overflow-y-auto border-l border-white/5 pl-5">
            <h2 className="text-sm font-semibold text-white/70">Downloads</h2>
            <DownloadQueue />
          </aside>
        </main>
      )}
    </div>
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

export default App
