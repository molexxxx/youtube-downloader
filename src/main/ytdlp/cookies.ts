/**
 * Browser cookie detection, cached export, and yt-dlp flag helpers.
 *
 * Detects which browsers are installed, exports a Netscape-format cookies file
 * once and reuses it (refreshing in the background when stale), and exposes sync
 * helpers that turn the current config into yt-dlp cookie flags. This lets the
 * app read private / age-restricted / members content without forcing a slow,
 * lock-prone browser read on every single request.
 */
import { app } from 'electron'
import { existsSync, statSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { create as createYtDlp } from 'youtube-dl-exec'
import type { AppConfig, CookieInfo, DetectedBrowser } from '@shared/types'
import { getConfig } from '../config'
import { logger } from '../logger'
import { ffmpegDir } from '../binaries/ffmpeg-binary'
import { ytdlpPath } from '../binaries/ytdlp-binary'

/** Per-platform browser → data-directory probes. */
const BROWSER_PATHS: Record<string, Record<string, () => string>> = {
  win32: {
    edge: () => join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'User Data'),
    chrome: () => join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data'),
    firefox: () => join(process.env.APPDATA || '', 'Mozilla', 'Firefox', 'Profiles'),
    opera: () => join(process.env.APPDATA || '', 'Opera Software', 'Opera Stable'),
    brave: () =>
      join(process.env.LOCALAPPDATA || '', 'BraveSoftware', 'Brave-Browser', 'User Data'),
    vivaldi: () => join(process.env.LOCALAPPDATA || '', 'Vivaldi', 'User Data')
  },
  darwin: {
    chrome: () => join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome'),
    safari: () => join(homedir(), 'Library', 'Safari'),
    firefox: () => join(homedir(), 'Library', 'Application Support', 'Firefox', 'Profiles'),
    opera: () => join(homedir(), 'Library', 'Application Support', 'com.operasoftware.Opera'),
    brave: () =>
      join(homedir(), 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser'),
    vivaldi: () => join(homedir(), 'Library', 'Application Support', 'Vivaldi'),
    edge: () => join(homedir(), 'Library', 'Application Support', 'Microsoft Edge')
  },
  linux: {
    chrome: () => join(homedir(), '.config', 'google-chrome'),
    firefox: () => join(homedir(), '.mozilla', 'firefox'),
    chromium: () => join(homedir(), '.config', 'chromium'),
    opera: () => join(homedir(), '.config', 'opera'),
    brave: () => join(homedir(), '.config', 'BraveSoftware', 'Brave-Browser'),
    vivaldi: () => join(homedir(), '.config', 'vivaldi'),
    edge: () => join(homedir(), '.config', 'microsoft-edge')
  }
}

/** Preferred probe order per platform. */
const BROWSER_ORDER: Record<string, string[]> = {
  win32: ['vivaldi', 'brave', 'firefox', 'chrome', 'edge', 'opera'],
  darwin: ['chrome', 'safari', 'firefox', 'brave', 'vivaldi', 'opera', 'edge'],
  linux: ['chrome', 'firefox', 'chromium', 'brave', 'vivaldi', 'opera', 'edge']
}

const LABELS: Record<string, string> = {
  chrome: 'Google Chrome',
  edge: 'Microsoft Edge',
  firefox: 'Firefox',
  opera: 'Opera',
  brave: 'Brave',
  vivaldi: 'Vivaldi',
  safari: 'Safari',
  chromium: 'Chromium'
}

/** Refresh the cached cookies file once it is older than this (7 days). */
const COOKIES_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** Return the browsers actually installed on this machine, in probe order. */
export function getInstalledBrowsers(): DetectedBrowser[] {
  const platformPaths = BROWSER_PATHS[process.platform] || {}
  const order = BROWSER_ORDER[process.platform] || Object.keys(platformPaths)
  const result: DetectedBrowser[] = []
  for (const name of order) {
    const probe = platformPaths[name]
    if (!probe) continue
    try {
      if (existsSync(probe())) {
        result.push({ name, label: LABELS[name] ?? name })
      }
    } catch {
      // ignore unreadable probe paths
    }
  }
  return result
}

function cookiesFilePath(): string {
  return join(app.getPath('userData'), 'cookies.txt')
}

/** Resolve the config browser setting to a concrete browser name, or null. */
function effectiveBrowser(cfg: AppConfig): string | null {
  const raw = cfg.cookiesFromBrowser
  if (!raw) return null
  if (raw === 'auto') return getInstalledBrowsers()[0]?.name ?? null
  return raw
}

/** Human-friendly label for a yt-dlp browser id, e.g. 'chrome' → 'Google Chrome'. */
export function browserLabel(name: string | null): string | null {
  if (!name) return null
  return LABELS[name] ?? name
}

function cacheAgeMs(): number | null {
  try {
    const stat = statSync(cookiesFilePath())
    return stat.size > 0 ? Date.now() - stat.mtimeMs : null
  } catch {
    return null
  }
}

let exportInFlight: Promise<boolean> | null = null

/** Minimum gap between background export attempts (a locked browser fails fast). */
const EXPORT_COOLDOWN_MS = 60_000
let lastExportAttempt = 0

/** Export cookies from a browser into the cached cookies file. */
function exportCookies(browser: string): Promise<boolean> {
  if (exportInFlight) return exportInFlight
  const file = cookiesFilePath()
  const engine = createYtDlp(ytdlpPath())
  exportInFlight = engine('https://www.youtube.com/watch?v=jNQXAC9IVRw', {
    cookiesFromBrowser: browser,
    cookies: file,
    skipDownload: true,
    noWarnings: true,
    noCheckCertificates: true,
    ffmpegLocation: ffmpegDir()
  } as never)
    .then(() => {
      logger.info('Exported cookies from', browser)
      return true
    })
    .catch((err: unknown) => {
      // yt-dlp sometimes writes a usable file even while reporting a warning.
      if (existsSync(file) && statSync(file).size > 0) return true
      logger.warn(
        'Cookie export failed:',
        err instanceof Error ? err.message : String(err)
      )
      return false
    })
    .finally(() => {
      exportInFlight = null
    })
  return exportInFlight
}

/** Kick a background refresh without blocking the caller. */
function refreshInBackground(browser: string): void {
  // Throttle: a locked browser makes the export fail, and without a cooldown
  // every cookie-free download would re-trigger a doomed attempt. Wait before
  // retrying so we don't spam yt-dlp processes or the log.
  if (Date.now() - lastExportAttempt < EXPORT_COOLDOWN_MS) return
  lastExportAttempt = Date.now()
  void exportCookies(browser)
}

/**
 * Whether a yt-dlp failure indicates the content actually requires an
 * authenticated session (private, age-restricted, members-only) or that YouTube
 * is rate-limiting/bot-flagging this client. These are the only cases where
 * supplying browser cookies can help, so we retry *with* cookies when we see one.
 */
export function isAuthRequiredError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    /sign in to confirm/i.test(message) ||
    /confirm your age|age[- ]restricted|inappropriate for some users/i.test(message) ||
    /private video/i.test(message) ||
    /members[- ]only|available to (this channel's |)members|join this channel/i.test(message) ||
    /requires payment|purchase/i.test(message) ||
    /not a bot/i.test(message) ||
    /login required|account/i.test(message)
  )
}

/** Whether the user has configured cookie usage at all. */
export function cookiesEnabled(cfg = getConfig()): boolean {
  return effectiveBrowser(cfg) != null
}

/**
 * Build yt-dlp CLI cookie args for a download spawn. Uses ONLY the pre-exported
 * cache file — never a live `--cookies-from-browser` read. A live read locks on
 * (and is blocked by) a running Chromium browser, which would make every normal
 * download fail or stall. When no cache exists yet we kick off a background
 * export and download cookie-free this time; public content works regardless,
 * and private content picks up cookies once a cache has been built (e.g. via the
 * Settings "Refresh" action while the browser is closed).
 */
export function cookieArgs(cfg = getConfig()): string[] {
  const browser = effectiveBrowser(cfg)
  if (!browser) return []
  const age = cacheAgeMs()
  if (age == null) {
    refreshInBackground(browser)
    return []
  }
  if (age > COOKIES_MAX_AGE_MS) refreshInBackground(browser)
  return ['--cookies', cookiesFilePath()]
}

/** Same as {@link cookieArgs} but as youtube-dl-exec option flags. */
export function cookieFlags(cfg = getConfig()): Record<string, string> {
  const browser = effectiveBrowser(cfg)
  if (!browser) return {}
  const age = cacheAgeMs()
  if (age == null) {
    refreshInBackground(browser)
    return {}
  }
  if (age > COOKIES_MAX_AGE_MS) refreshInBackground(browser)
  return { cookies: cookiesFilePath() }
}

/** Current cookie cache state for the Settings UI. */
export function getCookieInfo(cfg = getConfig()): CookieInfo {
  const age = cacheAgeMs()
  const resolved = effectiveBrowser(cfg)
  return {
    browser: cfg.cookiesFromBrowser ?? '',
    effectiveBrowser: resolved,
    effectiveLabel: browserLabel(resolved),
    cached: age != null,
    ageMs: age,
    detected: getInstalledBrowsers()
  }
}

/** Force a fresh export from the effective browser. */
export async function refreshCookies(cfg = getConfig()): Promise<CookieInfo> {
  const browser = effectiveBrowser(cfg)
  if (browser) {
    try {
      unlinkSync(cookiesFilePath())
    } catch {
      // no cache yet
    }
    await exportCookies(browser)
  }
  return getCookieInfo(cfg)
}

/** Delete the cached cookies file. */
export function clearCookies(): void {
  try {
    unlinkSync(cookiesFilePath())
    logger.info('Cleared cached cookies')
  } catch {
    // nothing cached
  }
}
