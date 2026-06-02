/**
 * Shared type contracts used across the main, preload, and renderer processes.
 */

export type Platform = 'win32' | 'darwin' | 'linux'

export type Theme = 'dark' | 'light' | 'system'

export type AudioFormat = 'mp3' | 'm4a' | 'opus' | 'flac' | 'wav'

export type VideoContainer = 'mp4' | 'mkv'

export interface AppConfig {
  theme: Theme
  downloadDir: string
  maxConcurrentDownloads: number
  defaultPreset: string
  videoContainer: VideoContainer
  embedThumbnail: boolean
  embedMetadata: boolean
  embedChapters: boolean
  writeSubtitles: boolean
  subtitleLangs: string[]
  sponsorBlock: boolean
  useDownloadArchive: boolean
  cookiesFromBrowser: string | null
  outputTemplate: string
  autoUpdateApp: boolean
  autoUpdateBinaries: boolean
  notifications: boolean
  closeToTray: boolean
}

export const DEFAULT_CONFIG: AppConfig = {
  theme: 'system',
  downloadDir: '',
  maxConcurrentDownloads: 3,
  defaultPreset: 'best-mp4',
  videoContainer: 'mp4',
  embedThumbnail: true,
  embedMetadata: true,
  embedChapters: true,
  writeSubtitles: false,
  subtitleLangs: ['en'],
  sponsorBlock: false,
  useDownloadArchive: false,
  cookiesFromBrowser: null,
  outputTemplate: '%(title)s [%(id)s].%(ext)s',
  autoUpdateApp: true,
  autoUpdateBinaries: true,
  notifications: true,
  closeToTray: false
}

/** Stages reported while acquiring a managed binary. */
export type BootstrapStage =
  | 'checking'
  | 'downloading'
  | 'extracting'
  | 'verifying'
  | 'complete'
  | 'error'

export interface BootstrapProgress {
  binary: 'yt-dlp' | 'ffmpeg'
  stage: BootstrapStage
  /** 0-100 when known, otherwise null for indeterminate. */
  percent: number | null
  message?: string
}

export interface BinaryStatus {
  name: 'yt-dlp' | 'ffmpeg'
  installed: boolean
  path: string | null
  version: string | null
}

export interface BinariesStatus {
  ytdlp: BinaryStatus
  ffmpeg: BinaryStatus
}

export interface VideoFormat {
  formatId: string
  ext: string
  resolution: string | null
  fps: number | null
  vcodec: string | null
  acodec: string | null
  filesize: number | null
  tbr: number | null
  note: string | null
}

export interface MediaInfo {
  id: string
  title: string
  uploader: string | null
  duration: number | null
  thumbnail: string | null
  webpageUrl: string
  isPlaylist: boolean
  playlistCount: number
  formats: VideoFormat[]
  entries: PlaylistEntry[]
}

export interface PlaylistEntry {
  id: string
  title: string
  url: string
  duration: number | null
  thumbnail: string | null
}

export type DownloadKind = 'video' | 'audio'

export interface DownloadRequest {
  url: string
  kind: DownloadKind
  formatId?: string
  container?: VideoContainer
  audioFormat?: AudioFormat
  audioBitrate?: number
  playlistItems?: string
  /** Force single-video download even if the URL carries a playlist (`&list=`). */
  noPlaylist?: boolean
  /** Per-download overrides for embedding/processing. When omitted, the saved config wins. */
  embedThumbnail?: boolean
  embedMetadata?: boolean
  embedChapters?: boolean
  writeSubtitles?: boolean
  sponsorBlock?: boolean
}

export type DownloadState =
  | 'queued'
  | 'extracting'
  | 'downloading'
  | 'processing'
  | 'completed'
  | 'error'
  | 'cancelled'

export interface DownloadJob {
  id: string
  url: string
  title: string
  kind: DownloadKind
  state: DownloadState
  percent: number
  speed: string | null
  eta: string | null
  outputPath: string | null
  error: string | null
  createdAt: number
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  timestamp: number
}

/** A finished download recorded in the persistent history. */
export interface HistoryEntry {
  id: string
  url: string
  title: string
  kind: DownloadKind
  status: 'completed' | 'error' | 'cancelled'
  outputPath: string | null
  error: string | null
  completedAt: number
}

/** Live state of the in-app application updater. */
export type AppUpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface AppUpdateStatus {
  state: AppUpdateState
  /** Version offered by the update, when known. */
  version: string | null
  /** Download progress 0-100 while state is 'downloading'. */
  percent: number | null
  error: string | null
}

/** A browser detected on this machine that yt-dlp can read cookies from. */
export interface DetectedBrowser {
  /** yt-dlp identifier, e.g. 'chrome'. */
  name: string
  /** Human-friendly label, e.g. 'Google Chrome'. */
  label: string
}

/** State of the cached cookies export. */
export interface CookieInfo {
  /** Selected browser ('auto', a browser name, or '' when disabled). */
  browser: string
  /** Concrete browser cookies resolve to (auto picks the first installed). */
  effectiveBrowser: string | null
  /** Human-friendly label for {@link effectiveBrowser}, e.g. 'Google Chrome'. */
  effectiveLabel: string | null
  /** True when a non-empty cookies cache file exists. */
  cached: boolean
  /** Age of the cache in milliseconds, or null when absent. */
  ageMs: number | null
  /** Browsers detected on this machine. */
  detected: DetectedBrowser[]
}

/** IPC channel names — single source of truth shared by preload + main. */
export const IPC = {
  config: {
    get: 'config:get',
    set: 'config:set',
    reset: 'config:reset'
  },
  binaries: {
    status: 'binaries:status',
    bootstrap: 'binaries:bootstrap',
    update: 'binaries:update',
    onProgress: 'binaries:progress'
  },
  extract: {
    info: 'extract:info',
    search: 'extract:search'
  },
  download: {
    start: 'download:start',
    cancel: 'download:cancel',
    list: 'download:list',
    onUpdate: 'download:update'
  },
  appUpdate: {
    status: 'appUpdate:status',
    check: 'appUpdate:check',
    download: 'appUpdate:download',
    install: 'appUpdate:install',
    onStatus: 'appUpdate:onStatus'
  },
  cookies: {
    info: 'cookies:info',
    set: 'cookies:set',
    refresh: 'cookies:refresh',
    clear: 'cookies:clear'
  },
  history: {
    list: 'history:list',
    remove: 'history:remove',
    clear: 'history:clear',
    onChange: 'history:change'
  },
  system: {
    minimize: 'system:minimize',
    maximize: 'system:maximize',
    close: 'system:close',
    openPath: 'system:openPath',
    showItem: 'system:showItem',
    chooseDir: 'system:chooseDir',
    openExternal: 'system:openExternal',
    appVersion: 'system:appVersion'
  },
  logs: {
    list: 'logs:list',
    onEntry: 'logs:entry'
  }
} as const
