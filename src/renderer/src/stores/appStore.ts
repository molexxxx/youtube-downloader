import { create } from 'zustand'
import type {
  AppConfig,
  AppUpdateStatus,
  AuditEntry,
  BinariesStatus,
  BootstrapProgress,
  DiscordGuild,
  DiscordStatus,
  DownloadJob,
  GuildPlayerState,
  HistoryEntry,
  LocalAudioFile,
  LogEntry,
  MediaInfo,
  PlaylistEntry
} from '@shared/types'

export type AppView = 'downloads' | 'history' | 'logs' | 'settings' | 'discord'

/** A YouTube video being previewed in the in-app player modal. */
export interface VideoPreview {
  embedUrl: string
  watchUrl: string
  title: string
}

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
  /** Video currently open in the in-app preview modal, if any. */
  preview: VideoPreview | null
  /** Local audio files imported for previewing / queueing on the bot. */
  localFiles: LocalAudioFile[]

  // Discord bot section.
  discordStatus: DiscordStatus | null
  discordGuilds: DiscordGuild[]
  activeGuildId: string | null
  playerStates: Record<string, GuildPlayerState>
  audit: AuditEntry[]
  /**
   * True once a live status/guilds event (or the initial snapshot) has been
   * applied. Guards against a slow startup snapshot overwriting a newer live
   * event - the bot can reach 'ready' before the batched initial read resolves.
   */
  discordSeeded: boolean

  setConfig: (config: AppConfig) => void
  patchConfig: (partial: Partial<AppConfig>) => void
  setBinaries: (binaries: BinariesStatus) => void
  setBootstrap: (progress: BootstrapProgress | null) => void
  setView: (view: AppView) => void
  setInfo: (info: MediaInfo | null) => void
  appendEntries: (entries: PlaylistEntry[]) => void
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
  setPreview: (preview: VideoPreview | null) => void
  addLocalFiles: (files: LocalAudioFile[]) => void
  removeLocalFile: (path: string) => void

  setDiscordStatus: (status: DiscordStatus) => void
  setDiscordGuilds: (guilds: DiscordGuild[]) => void
  /** Apply the initial status/guilds snapshot, unless a live event beat it. */
  seedDiscord: (status: DiscordStatus, guilds: DiscordGuild[]) => void
  setActiveGuildId: (guildId: string | null) => void
  upsertPlayerState: (state: GuildPlayerState) => void
  setAudit: (entries: AuditEntry[]) => void
}

/** Pick a sensible active guild: keep the current one if still present, else first. */
function resolveActiveGuild(
  guilds: DiscordGuild[],
  current: string | null
): string | null {
  if (current && guilds.some((g) => g.id === current)) return current
  return guilds[0]?.id ?? null
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
  preview: null,
  localFiles: [],

  discordStatus: null,
  discordGuilds: [],
  activeGuildId: null,
  playerStates: {},
  audit: [],
  discordSeeded: false,

  setConfig: (config) => set({ config }),
  patchConfig: (partial) =>
    set((state) => ({
      config: state.config ? { ...state.config, ...partial } : state.config
    })),
  setBinaries: (binaries) => set({ binaries, binariesReady: binariesAreReady(binaries) }),
  setBootstrap: (bootstrap) => set({ bootstrap }),
  setView: (view) => set({ view }),
  setInfo: (info) => set({ info }),
  appendEntries: (entries) =>
    set((state) => {
      if (!state.info) return state
      // De-dupe by id in case a page overlaps an already-loaded range.
      const seen = new Set(state.info.entries.map((e) => e.id))
      const added = entries.filter((e) => !e.id || !seen.has(e.id))
      return { info: { ...state.info, entries: [...state.info.entries, ...added] } }
    }),
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
        (j) => j.state !== 'completed' && j.state !== 'error' && j.state !== 'cancelled'
      )
    })),
  setHistory: (history) => set({ history }),
  setLogs: (logs) => set({ logs }),
  appendLog: (entry) =>
    set((state) => ({ logs: [...state.logs, entry].slice(-MAX_LOGS) })),
  setAppUpdate: (appUpdate) => set({ appUpdate }),
  setError: (error) => set({ error }),
  setCookieHint: (cookieHint) => set({ cookieHint }),
  setPreview: (preview) => set({ preview }),
  addLocalFiles: (files) =>
    set((state) => {
      // De-dupe by path so re-importing a file never creates a second row.
      const seen = new Set(state.localFiles.map((f) => f.path))
      const added = files.filter((f) => !seen.has(f.path))
      return added.length ? { localFiles: [...state.localFiles, ...added] } : state
    }),
  removeLocalFile: (path) =>
    set((state) => ({ localFiles: state.localFiles.filter((f) => f.path !== path) })),

  setDiscordStatus: (discordStatus) => set({ discordStatus, discordSeeded: true }),
  setDiscordGuilds: (discordGuilds) =>
    set((state) => ({
      discordGuilds,
      activeGuildId: resolveActiveGuild(discordGuilds, state.activeGuildId),
      discordSeeded: true
    })),
  seedDiscord: (status, guilds) =>
    set((state) => {
      // A live status/guilds event already updated the store - never let the
      // slower batched startup snapshot overwrite it with stale data.
      if (state.discordSeeded) return state
      return {
        discordStatus: status,
        discordGuilds: guilds,
        activeGuildId: resolveActiveGuild(guilds, state.activeGuildId),
        discordSeeded: true
      }
    }),
  setActiveGuildId: (activeGuildId) => set({ activeGuildId }),
  upsertPlayerState: (playerState) =>
    set((state) => ({
      playerStates: { ...state.playerStates, [playerState.guildId]: playerState }
    })),
  setAudit: (audit) => set({ audit })
}))
