import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {
  IPC,
  type AppConfig,
  type AppUpdateStatus,
  type AudioEffects,
  type AuditEntry,
  type BinariesStatus,
  type BootstrapProgress,
  type CookieInfo,
  type DiscordGuild,
  type DiscordStatus,
  type DownloadJob,
  type DownloadRequest,
  type GuildPlayerState,
  type GuildSettings,
  type HistoryEntry,
  type LocalAudioFile,
  type LogEntry,
  type LoopMode,
  type MediaInfo,
  type MiniWindowSize,
  type PlayerControl,
  type PlaylistEntry,
  type TrackInput
} from '@shared/types'

function on<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  config: {
    get: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.config.get),
    set: (partial: Partial<AppConfig>): Promise<AppConfig> =>
      ipcRenderer.invoke(IPC.config.set, partial),
    reset: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.config.reset)
  },
  binaries: {
    status: (): Promise<BinariesStatus> => ipcRenderer.invoke(IPC.binaries.status),
    bootstrap: (): Promise<BinariesStatus> => ipcRenderer.invoke(IPC.binaries.bootstrap),
    update: (which: 'yt-dlp' | 'ffmpeg' | 'all'): Promise<Partial<BinariesStatus>> =>
      ipcRenderer.invoke(IPC.binaries.update, which),
    onProgress: (cb: (p: BootstrapProgress) => void) => on(IPC.binaries.onProgress, cb)
  },
  extract: {
    info: (url: string, forcePlaylist?: boolean): Promise<MediaInfo> =>
      ipcRenderer.invoke(IPC.extract.info, url, forcePlaylist),
    search: (query: string, limit?: number): Promise<PlaylistEntry[]> =>
      ipcRenderer.invoke(IPC.extract.search, query, limit),
    playlistPage: (url: string, start: number, end: number): Promise<PlaylistEntry[]> =>
      ipcRenderer.invoke(IPC.extract.playlistPage, url, start, end)
  },
  download: {
    start: (req: DownloadRequest): Promise<DownloadJob> =>
      ipcRenderer.invoke(IPC.download.start, req),
    cancel: (id: string): Promise<void> => ipcRenderer.invoke(IPC.download.cancel, id),
    list: (): Promise<DownloadJob[]> => ipcRenderer.invoke(IPC.download.list),
    onUpdate: (cb: (job: DownloadJob) => void) => on(IPC.download.onUpdate, cb)
  },
  appUpdate: {
    status: (): Promise<AppUpdateStatus> => ipcRenderer.invoke(IPC.appUpdate.status),
    check: (): Promise<{ ok: boolean; version?: string | null; error?: string }> =>
      ipcRenderer.invoke(IPC.appUpdate.check),
    download: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.appUpdate.download),
    install: (): Promise<void> => ipcRenderer.invoke(IPC.appUpdate.install),
    onStatus: (cb: (status: AppUpdateStatus) => void) => on(IPC.appUpdate.onStatus, cb)
  },
  cookies: {
    info: (): Promise<CookieInfo> => ipcRenderer.invoke(IPC.cookies.info),
    set: (browser: string): Promise<CookieInfo> =>
      ipcRenderer.invoke(IPC.cookies.set, browser),
    refresh: (): Promise<CookieInfo> => ipcRenderer.invoke(IPC.cookies.refresh),
    clear: (): Promise<CookieInfo> => ipcRenderer.invoke(IPC.cookies.clear)
  },
  history: {
    list: (): Promise<HistoryEntry[]> => ipcRenderer.invoke(IPC.history.list),
    remove: (id: string): Promise<HistoryEntry[]> =>
      ipcRenderer.invoke(IPC.history.remove, id),
    clear: (): Promise<HistoryEntry[]> => ipcRenderer.invoke(IPC.history.clear),
    onChange: (cb: (entries: HistoryEntry[]) => void) => on(IPC.history.onChange, cb)
  },
  system: {
    minimize: (): Promise<void> => ipcRenderer.invoke(IPC.system.minimize),
    maximize: (): Promise<void> => ipcRenderer.invoke(IPC.system.maximize),
    close: (): Promise<void> => ipcRenderer.invoke(IPC.system.close),
    openPath: (path: string): Promise<string> =>
      ipcRenderer.invoke(IPC.system.openPath, path),
    showItem: (path: string): Promise<void> =>
      ipcRenderer.invoke(IPC.system.showItem, path),
    chooseDir: (): Promise<string | null> => ipcRenderer.invoke(IPC.system.chooseDir),
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke(IPC.system.openExternal, url),
    appVersion: (): Promise<string> => ipcRenderer.invoke(IPC.system.appVersion)
  },
  logs: {
    list: (): Promise<LogEntry[]> => ipcRenderer.invoke(IPC.logs.list),
    onEntry: (cb: (entry: LogEntry) => void) => on(IPC.logs.onEntry, cb)
  },
  mini: {
    open: (): Promise<void> => ipcRenderer.invoke(IPC.mini.open),
    close: (): Promise<void> => ipcRenderer.invoke(IPC.mini.close),
    setSize: (size: MiniWindowSize): Promise<void> =>
      ipcRenderer.invoke(IPC.mini.setSize, size),
    setPinned: (pinned: boolean): Promise<boolean> =>
      ipcRenderer.invoke(IPC.mini.setPinned, pinned),
    focusMain: (): Promise<void> => ipcRenderer.invoke(IPC.mini.focusMain)
  },
  localMedia: {
    pick: (): Promise<LocalAudioFile[]> => ipcRenderer.invoke(IPC.localMedia.pick),
    register: (paths: string[]): Promise<LocalAudioFile[]> =>
      ipcRenderer.invoke(IPC.localMedia.register, paths),
    /** Absolute disk path for a File dropped onto the window. */
    pathForFile: (file: File): string => webUtils.getPathForFile(file)
  },
  discord: {
    status: (): Promise<DiscordStatus> => ipcRenderer.invoke(IPC.discord.status),
    guilds: (): Promise<DiscordGuild[]> => ipcRenderer.invoke(IPC.discord.guilds),
    setToken: (token: string): Promise<DiscordStatus> =>
      ipcRenderer.invoke(IPC.discord.setToken, token),
    clearToken: (): Promise<DiscordStatus> => ipcRenderer.invoke(IPC.discord.clearToken),
    connect: (): Promise<DiscordStatus> => ipcRenderer.invoke(IPC.discord.connect),
    disconnect: (): Promise<DiscordStatus> => ipcRenderer.invoke(IPC.discord.disconnect),
    player: (guildId: string): Promise<GuildPlayerState | null> =>
      ipcRenderer.invoke(IPC.discord.player, guildId),
    join: (guildId: string, channelId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.discord.join, guildId, channelId),
    leave: (guildId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.discord.leave, guildId),
    enqueue: (guildId: string, inputs: TrackInput[]): Promise<boolean> =>
      ipcRenderer.invoke(IPC.discord.enqueue, guildId, inputs),
    control: (guildId: string, action: PlayerControl): Promise<void> =>
      ipcRenderer.invoke(IPC.discord.control, guildId, action),
    setLoop: (guildId: string, mode: LoopMode): Promise<void> =>
      ipcRenderer.invoke(IPC.discord.setLoop, guildId, mode),
    setVolume: (guildId: string, volume: number): Promise<void> =>
      ipcRenderer.invoke(IPC.discord.setVolume, guildId, volume),
    setEffects: (guildId: string, effects: AudioEffects): Promise<void> =>
      ipcRenderer.invoke(IPC.discord.setEffects, guildId, effects),
    seek: (guildId: string, seconds: number): Promise<void> =>
      ipcRenderer.invoke(IPC.discord.seek, guildId, seconds),
    removeTrack: (guildId: string, index: number): Promise<void> =>
      ipcRenderer.invoke(IPC.discord.removeTrack, guildId, index),
    moveTrack: (guildId: string, from: number, to: number): Promise<void> =>
      ipcRenderer.invoke(IPC.discord.moveTrack, guildId, from, to),
    getSettings: (guildId: string): Promise<GuildSettings> =>
      ipcRenderer.invoke(IPC.discord.getSettings, guildId),
    setSettings: (
      guildId: string,
      partial: Partial<GuildSettings>
    ): Promise<GuildSettings> =>
      ipcRenderer.invoke(IPC.discord.setSettings, guildId, partial),
    auditList: (guildId?: string): Promise<AuditEntry[]> =>
      ipcRenderer.invoke(IPC.discord.auditList, guildId),
    onStatus: (cb: (status: DiscordStatus) => void) => on(IPC.discord.onStatus, cb),
    onGuilds: (cb: (guilds: DiscordGuild[]) => void) => on(IPC.discord.onGuilds, cb),
    onPlayer: (cb: (state: GuildPlayerState) => void) => on(IPC.discord.onPlayer, cb),
    onAudit: (cb: (entries: AuditEntry[]) => void) => on(IPC.discord.onAudit, cb)
  }
}

export type Api = typeof api

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('api', api)
} else {
  const globalWindow = window as unknown as {
    electron: typeof electronAPI
    api: Api
  }
  globalWindow.electron = electronAPI
  globalWindow.api = api
}
