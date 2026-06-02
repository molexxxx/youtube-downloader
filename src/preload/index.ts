import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {
  IPC,
  type AppConfig,
  type AppUpdateStatus,
  type BinariesStatus,
  type BootstrapProgress,
  type CookieInfo,
  type DownloadJob,
  type DownloadRequest,
  type HistoryEntry,
  type LogEntry,
  type MediaInfo,
  type PlaylistEntry
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
      ipcRenderer.invoke(IPC.extract.search, query, limit)
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
    openPath: (path: string): Promise<string> => ipcRenderer.invoke(IPC.system.openPath, path),
    showItem: (path: string): Promise<void> => ipcRenderer.invoke(IPC.system.showItem, path),
    chooseDir: (): Promise<string | null> => ipcRenderer.invoke(IPC.system.chooseDir),
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC.system.openExternal, url),
    appVersion: (): Promise<string> => ipcRenderer.invoke(IPC.system.appVersion)
  },
  logs: {
    list: (): Promise<LogEntry[]> => ipcRenderer.invoke(IPC.logs.list),
    onEntry: (cb: (entry: LogEntry) => void) => on(IPC.logs.onEntry, cb)
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
