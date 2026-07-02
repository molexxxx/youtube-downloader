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
  // Max number of items fetched when resolving a playlist/mix. Large Mix/radio
  // lists can run into the hundreds and paginate slowly; 0 means no limit.
  playlistFetchLimit: number
  autoUpdateApp: boolean
  autoUpdateBinaries: boolean
  notifications: boolean
  closeToTray: boolean
  /** Start the app automatically when the user logs in (keeps the bot online). */
  launchOnStartup: boolean
  /** When launched at login, start hidden in the tray instead of showing a window. */
  startMinimized: boolean
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
  playlistFetchLimit: 200,
  autoUpdateApp: true,
  autoUpdateBinaries: true,
  notifications: true,
  closeToTray: false,
  launchOnStartup: false,
  startMinimized: false
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
  /** Channel / artist name, when the extractor provides it. */
  uploader: string | null
}

export type DownloadKind = 'video' | 'audio'

export interface DownloadRequest {
  url: string
  kind: DownloadKind
  /** Human-readable title for the queue UI; falls back to the URL when omitted. */
  title?: string
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

/** Gateway connection state of the Discord bot. */
export type DiscordConnectionState = 'disconnected' | 'connecting' | 'ready' | 'error'

/** Public status of the Discord bot - never carries the secret token. */
export interface DiscordStatus {
  state: DiscordConnectionState
  botUser: { id: string; username: string; avatar: string | null } | null
  applicationId: string | null
  /** Whether a token is stored locally (so the UI can show "connect" vs "set up"). */
  hasToken: boolean
  /** OAuth2 invite URL with the right scopes/permissions, once the app id is known. */
  inviteUrl: string | null
  error: string | null
}

export interface DiscordRole {
  id: string
  name: string
  /** Hex color string, e.g. '#5865f2', or null for the default role color. */
  color: string | null
}

export interface DiscordVoiceChannel {
  id: string
  name: string
}

export interface DiscordGuild {
  id: string
  name: string
  icon: string | null
  voiceChannels: DiscordVoiceChannel[]
  roles: DiscordRole[]
}

/** Who requested a track or triggered an action. */
export interface TrackRequester {
  source: 'ui' | 'discord'
  userId: string | null
  username: string
}

export interface Track {
  id: string
  title: string
  url: string
  duration: number | null
  thumbnail: string | null
  /** Channel / artist name, when known. */
  uploader: string | null
  /** Local media file to play directly (from a completed download), skipping yt-dlp. */
  filePath?: string | null
  requestedBy: TrackRequester
  addedAt: number
}

/** A track before it is stamped with a requester/id (the enqueue payload). */
export interface TrackInput {
  title: string
  url: string
  duration: number | null
  thumbnail: string | null
  /** Channel / artist name, when known. */
  uploader: string | null
  /** Local media file to play directly (from a completed download), skipping yt-dlp. */
  filePath?: string | null
}

export type LoopMode = 'off' | 'track' | 'queue'

export type PlayerStatus = 'idle' | 'buffering' | 'playing' | 'paused'

/**
 * Mutually exclusive character effects, mapped to ffmpeg filters. Parameter
 * conventions follow the Lavalink filters API (the de-facto standard for
 * Discord music bots): tremolo/vibrato as frequency+depth oscillators,
 * rotation ("8D") as a slow stereo pan, karaoke as center-channel removal.
 */
export type AudioEffectMode =
  | 'none'
  | 'karaoke'
  | 'tremolo'
  | 'vibrato'
  | 'rotate'
  | 'echo'

/**
 * Per-guild playback effects (Lavalink-style timescale + tone controls).
 * Applied live via the ffmpeg leg of the streaming pipeline; changing them
 * restarts the stream at the current position.
 */
export interface AudioEffects {
  /** Playback speed multiplier (media tempo), 0.5-2. Pitch is unaffected. */
  speed: number
  /** Pitch multiplier, 0.5-2 (asetrate-based; tempo-compensated). */
  pitch: number
  /** Bass shelf gain in dB (~100 Hz), -12..12. */
  bassGain: number
  /** Mid peak gain in dB (~1 kHz), -12..12. */
  midGain: number
  /** Treble shelf gain in dB (~3 kHz), -12..12. */
  trebleGain: number
  mode: AudioEffectMode
}

export const DEFAULT_AUDIO_EFFECTS: AudioEffects = {
  speed: 1,
  pitch: 1,
  bassGain: 0,
  midGain: 0,
  trebleGain: 0,
  mode: 'none'
}

/** Live state of one guild's music player. */
export interface GuildPlayerState {
  guildId: string
  voiceChannelId: string | null
  status: PlayerStatus
  nowPlaying: Track | null
  queue: Track[]
  loop: LoopMode
  /** 0-100. */
  volume: number
  /** Playback position of nowPlaying in ms (pause-aware, includes seeks). */
  positionMs: number
  /** Active playback effects (speed, pitch, EQ, character effect). */
  effects: AudioEffects
}

/** Per-guild settings persisted locally on this machine. */
export interface GuildSettings {
  /** When set, only members with this role can drive playback via slash commands. */
  allowedRoleId: string | null
  /** 0-100, applied to new players for this guild. */
  defaultVolume: number
  /** Leave the voice channel when it empties or the queue ends. */
  autoLeaveOnEmpty: boolean
  /** Remember the last channel the bot played in, for quick re-join. */
  lastVoiceChannelId: string | null
}

export const DEFAULT_GUILD_SETTINGS: GuildSettings = {
  allowedRoleId: null,
  defaultVolume: 100,
  autoLeaveOnEmpty: true,
  lastVoiceChannelId: null
}

export type AuditAction =
  | 'connect'
  | 'disconnect'
  | 'join'
  | 'leave'
  | 'play'
  | 'enqueue'
  | 'skip'
  | 'pause'
  | 'resume'
  | 'stop'
  | 'clear'
  | 'shuffle'
  | 'loop'
  | 'volume'
  | 'remove'
  | 'move'
  | 'seek'
  | 'effects'
  | 'permission-denied'
  | 'error'

/** A recorded action in a guild, from either the UI or a Discord user. */
export interface AuditEntry {
  id: string
  guildId: string
  ts: number
  actor: TrackRequester
  action: AuditAction
  detail: string
}

/** A local audio file imported by the user (for previewing / bot playback). */
export interface LocalAudioFile {
  /** Absolute path on disk. */
  path: string
  /** File name including extension. */
  name: string
  /** Size in bytes. */
  size: number
  /** Streamable app-scheme URL (`local-media:`) usable in an <audio> element. */
  mediaUrl: string
}

/** Named window sizes for the pinned quick-actions window. */
export type MiniWindowSize = 'compact' | 'standard' | 'tall'

/** IPC channel names - single source of truth shared by preload + main. */
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
    search: 'extract:search',
    playlistPage: 'extract:playlistPage'
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
  },
  mini: {
    open: 'mini:open',
    close: 'mini:close',
    setSize: 'mini:setSize',
    setPinned: 'mini:setPinned',
    focusMain: 'mini:focusMain'
  },
  localMedia: {
    pick: 'localMedia:pick',
    register: 'localMedia:register'
  },
  discord: {
    status: 'discord:status',
    setToken: 'discord:setToken',
    clearToken: 'discord:clearToken',
    connect: 'discord:connect',
    disconnect: 'discord:disconnect',
    guilds: 'discord:guilds',
    player: 'discord:player',
    join: 'discord:join',
    leave: 'discord:leave',
    enqueue: 'discord:enqueue',
    control: 'discord:control',
    setLoop: 'discord:setLoop',
    setVolume: 'discord:setVolume',
    setEffects: 'discord:setEffects',
    seek: 'discord:seek',
    removeTrack: 'discord:removeTrack',
    moveTrack: 'discord:moveTrack',
    getSettings: 'discord:getSettings',
    setSettings: 'discord:setSettings',
    auditList: 'discord:auditList',
    onStatus: 'discord:onStatus',
    onPlayer: 'discord:onPlayer',
    onAudit: 'discord:onAudit',
    onGuilds: 'discord:onGuilds'
  }
} as const

/** Player control verbs that take no extra payload. */
export type PlayerControl = 'skip' | 'pause' | 'resume' | 'stop' | 'shuffle' | 'clear'
