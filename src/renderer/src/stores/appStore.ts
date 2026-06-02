import { create } from 'zustand'
import type {
  AppConfig,
  AppUpdateStatus,
  BinariesStatus,
  BootstrapProgress,
  DownloadJob,
  HistoryEntry,
  LogEntry,
  MediaInfo,
  PlaylistEntry
} from '@shared/types'

export type AppView = 'downloads' | 'history' | 'logs' | 'settings'

const MAX_LOGS = 1000

interface AppState {
  config: AppConfig | null
  binaries: BinariesStatus | null
  bootstrap: BootstrapProgress | null
  binariesReady: boolean
  view: AppView
  info: MediaInfo | null
  searchResults: PlaylistEntry[]
  resolving: boolean
  jobs: DownloadJob[]
  history: HistoryEntry[]
  logs: LogEntry[]
  appUpdate: AppUpdateStatus | null
  error: string | null
  /** Set when a resolve/search fails on auth-gated content while cookies are off. */
  cookieHint: boolean

  setConfig: (config: AppConfig) => void
  patchConfig: (partial: Partial<AppConfig>) => void
  setBinaries: (binaries: BinariesStatus) => void
  setBootstrap: (progress: BootstrapProgress | null) => void
  setView: (view: AppView) => void
  setInfo: (info: MediaInfo | null) => void
  setSearchResults: (results: PlaylistEntry[]) => void
  setResolving: (resolving: boolean) => void
  upsertJob: (job: DownloadJob) => void
  setJobs: (jobs: DownloadJob[]) => void
  clearFinishedJobs: () => void
  setHistory: (history: HistoryEntry[]) => void
  setLogs: (logs: LogEntry[]) => void
  appendLog: (entry: LogEntry) => void
  setAppUpdate: (status: AppUpdateStatus) => void
  setError: (error: string | null) => void
  setCookieHint: (hint: boolean) => void
}

export function binariesAreReady(binaries: BinariesStatus | null): boolean {
  return Boolean(binaries?.ytdlp.installed && binaries?.ffmpeg.installed)
}

export const useAppStore = create<AppState>((set) => ({
  config: null,
  binaries: null,
  bootstrap: null,
  binariesReady: false,
  view: 'downloads',
  info: null,
  searchResults: [],
  resolving: false,
  jobs: [],
  history: [],
  logs: [],
  appUpdate: null,
  error: null,
  cookieHint: false,

  setConfig: (config) => set({ config }),
  patchConfig: (partial) =>
    set((state) => ({
      config: state.config ? { ...state.config, ...partial } : state.config
    })),
  setBinaries: (binaries) =>
    set({ binaries, binariesReady: binariesAreReady(binaries) }),
  setBootstrap: (bootstrap) => set({ bootstrap }),
  setView: (view) => set({ view }),
  setInfo: (info) => set({ info }),
  setSearchResults: (searchResults) => set({ searchResults }),
  setResolving: (resolving) => set({ resolving }),
  upsertJob: (job) =>
    set((state) => {
      const existing = state.jobs.findIndex((j) => j.id === job.id)
      if (existing >= 0) {
        const jobs = [...state.jobs]
        jobs[existing] = job
        return { jobs }
      }
      return { jobs: [...state.jobs, job] }
    }),
  setJobs: (jobs) => set({ jobs }),
  clearFinishedJobs: () =>
    set((state) => ({
      jobs: state.jobs.filter(
        (j) =>
          j.state !== 'completed' && j.state !== 'error' && j.state !== 'cancelled'
      )
    })),
  setHistory: (history) => set({ history }),
  setLogs: (logs) => set({ logs }),
  appendLog: (entry) =>
    set((state) => ({ logs: [...state.logs, entry].slice(-MAX_LOGS) })),
  setAppUpdate: (appUpdate) => set({ appUpdate }),
  setError: (error) => set({ error }),
  setCookieHint: (cookieHint) => set({ cookieHint })
}))
