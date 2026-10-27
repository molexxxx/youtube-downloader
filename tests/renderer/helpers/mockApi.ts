import { vi } from 'vitest'
import type {
  AppConfig,
  AppUpdateStatus,
  AuditEntry,
  BinariesScan,
  BinariesStatus,
  CookieInfo,
  DiscordGuild,
  DiscordStatus,
  DownloadJob,
  DownloadRequest,
  FfmpegStatus,
  GuildPlayerState,
  GuildSettings,
  HistoryEntry,
  LogEntry,
  MediaInfo,
  PlaylistEntry,
  YtdlpStatus
} from '@shared/types'

/**
 * Builds a fully-mocked `window.api` surface and installs it on the global
 * window. Returns the mock so individual tests can assert calls or override
 * resolved values. Every method is a `vi.fn()`; subscription methods return an
 * unsubscribe function.
 */
export function installMockApi() {
  const unsub = (): void => {}
  const api = {
    config: {
      get: vi.fn(async (): Promise<AppConfig> => baseConfig()),
      set: vi.fn(async (partial: Partial<AppConfig>): Promise<AppConfig> => ({
        ...baseConfig(),
        ...partial
      })),
      reset: vi.fn(async (): Promise<AppConfig> => baseConfig())
    },
    binaries: {
      status: vi.fn(async (): Promise<BinariesStatus> => baseBinaries()),
      bootstrap: vi.fn(async (): Promise<BinariesStatus> => baseBinaries()),
      checkYtdlp: vi.fn(async (): Promise<BinariesStatus> => baseBinaries()),
      scan: vi.fn(async (): Promise<BinariesScan> => ({
        ytdlp: null,
        ffmpeg: null,
        ytdlpRelease: null
      })),
      selfTest: vi.fn(async (_which: 'ytdlp' | 'ffmpeg'): Promise<BinariesStatus> =>
        baseBinaries()
      ),
      onStatus: vi.fn((_cb: (status: BinariesStatus) => void) => unsub)
    },
    extract: {
      info: vi.fn(
        async (_url: string, _forcePlaylist?: boolean): Promise<MediaInfo | null> => null
      ),
      search: vi.fn(
        async (_query: string, _limit?: number): Promise<PlaylistEntry[]> => []
      ),
      playlistPage: vi.fn(
        async (_url: string, _start: number, _end: number): Promise<PlaylistEntry[]> => []
      )
    },
    download: {
      start: vi.fn(
        async (_req: DownloadRequest): Promise<DownloadJob> =>
          ({ id: 'job-1' }) as DownloadJob
      ),
      cancel: vi.fn(async (_id: string): Promise<void> => {}),
      list: vi.fn(async (): Promise<DownloadJob[]> => []),
      onUpdate: vi.fn(() => unsub)
    },
    appUpdate: {
      status: vi.fn(
        async (): Promise<AppUpdateStatus> =>
          ({
            state: 'idle',
            version: null,
            percent: null,
            error: null
          }) as AppUpdateStatus
      ),
      check: vi.fn(
        async (): Promise<{ ok: boolean; version?: string | null; error?: string }> => ({
          ok: true,
          version: null
        })
      ),
      download: vi.fn(async (): Promise<{ ok: boolean; error?: string }> => ({
        ok: true
      })),
      install: vi.fn(async (): Promise<void> => {}),
      onStatus: vi.fn(() => unsub)
    },
    cookies: {
      info: vi.fn(async (): Promise<CookieInfo> => baseCookies()),
      set: vi.fn(async (_browser: string): Promise<CookieInfo> => baseCookies()),
      refresh: vi.fn(async (): Promise<CookieInfo> => baseCookies()),
      clear: vi.fn(async (): Promise<CookieInfo> => baseCookies())
    },
    history: {
      list: vi.fn(async (): Promise<HistoryEntry[]> => []),
      remove: vi.fn(async (_id: string): Promise<HistoryEntry[]> => []),
      clear: vi.fn(async (): Promise<HistoryEntry[]> => []),
      onChange: vi.fn(() => unsub)
    },
    system: {
      minimize: vi.fn(async (): Promise<void> => {}),
      maximize: vi.fn(async (): Promise<void> => {}),
      close: vi.fn(async (): Promise<void> => {}),
      openPath: vi.fn(async (_path: string): Promise<string> => ''),
      showItem: vi.fn(async (_path: string): Promise<void> => {}),
      chooseDir: vi.fn(async (): Promise<string | null> => null),
      openExternal: vi.fn(async (_url: string): Promise<void> => {}),
      appVersion: vi.fn(async (): Promise<string> => '0.1.9')
    },
    logs: {
      list: vi.fn(async (): Promise<LogEntry[]> => []),
      onEntry: vi.fn(() => unsub)
    },
    discord: {
      status: vi.fn(async (): Promise<DiscordStatus> => baseDiscordStatus()),
      guilds: vi.fn(async (): Promise<DiscordGuild[]> => []),
      setToken: vi.fn(async (_token: string): Promise<DiscordStatus> =>
        baseDiscordStatus()
      ),
      clearToken: vi.fn(async (): Promise<DiscordStatus> => baseDiscordStatus()),
      connect: vi.fn(async (): Promise<DiscordStatus> => baseDiscordStatus()),
      disconnect: vi.fn(async (): Promise<DiscordStatus> => baseDiscordStatus()),
      player: vi.fn(async (_guildId: string): Promise<GuildPlayerState | null> => null),
      join: vi.fn(async (_guildId: string, _channelId: string): Promise<void> => {}),
      leave: vi.fn(async (_guildId: string): Promise<void> => {}),
      enqueue: vi.fn(async (_guildId: string): Promise<boolean> => true),
      control: vi.fn(async (): Promise<void> => {}),
      setLoop: vi.fn(async (): Promise<void> => {}),
      setVolume: vi.fn(async (): Promise<void> => {}),
      seek: vi.fn(async (): Promise<void> => {}),
      removeTrack: vi.fn(async (): Promise<void> => {}),
      moveTrack: vi.fn(async (): Promise<void> => {}),
      getSettings: vi.fn(async (_guildId: string): Promise<GuildSettings> =>
        baseGuildSettings()
      ),
      setSettings: vi.fn(async (): Promise<GuildSettings> => baseGuildSettings()),
      auditList: vi.fn(async (_guildId?: string): Promise<AuditEntry[]> => []),
      onStatus: vi.fn(() => unsub),
      onGuilds: vi.fn(() => unsub),
      onPlayer: vi.fn(() => unsub),
      onAudit: vi.fn(() => unsub)
    }
  }
  ;(window as unknown as { api: unknown }).api = api
  return api
}

function baseDiscordStatus(): DiscordStatus {
  return {
    state: 'disconnected',
    botUser: null,
    applicationId: null,
    hasToken: false,
    inviteUrl: null,
    error: null
  }
}

function baseGuildSettings(): GuildSettings {
  return {
    allowedRoleId: null,
    defaultVolume: 100,
    autoLeaveOnEmpty: true,
    lastVoiceChannelId: null
  }
}

function baseConfig(): AppConfig {
  return {
    theme: 'dark',
    downloadDir: '/downloads',
    notifications: true,
    closeToTray: true,
    autoUpdateApp: true,
    cookiesFromBrowser: null
  } as unknown as AppConfig
}

/** A ready yt-dlp and FFmpeg, with any part replaced for a test. */
export function baseBinaries(
  overrides: { ytdlp?: Partial<YtdlpStatus>; ffmpeg?: Partial<FfmpegStatus> } = {}
): BinariesStatus {
  return {
    ytdlp: {
      installed: true,
      version: '2026.10.26',
      path: '/yt',
      source: 'app',
      selfTest: null,
      autoUpdate: true,
      lastCheckAt: null,
      latest: null,
      state: { kind: 'idle' },
      ...overrides.ytdlp
    },
    ffmpeg: {
      installed: true,
      version: '9.0.2',
      build: 'btbn-n9.0.2-17-g2a571b6068',
      path: '/ff',
      source: 'app',
      selfTest: null,
      pinned: {
        version: '9.0.2',
        build: 'btbn-n9.0.2-17-g2a571b6068',
        bytes: 194034585,
        publisher: 'BtbN FFmpeg Builds'
      },
      state: { kind: 'idle' },
      ...overrides.ffmpeg
    }
  }
}

function baseCookies(): CookieInfo {
  return {
    detected: [],
    cached: false,
    effectiveBrowser: null,
    effectiveLabel: null,
    ageMs: null
  } as unknown as CookieInfo
}
