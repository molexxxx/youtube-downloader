import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Code2,
  Download,
  ExternalLink,
  FolderOpen,
  Info,
  Lightbulb,
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2
} from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { PRESETS } from '@shared/presets'
import type { AppConfig, AppUpdateStatus, CookieInfo, Theme, VideoContainer } from '@shared/types'
import { Select } from '../shared/Select'

const THEMES: Theme[] = ['system', 'dark', 'light']
const CONTAINERS: VideoContainer[] = ['mp4', 'mkv']

function formatAge(ms: number | null): string {
  if (ms == null) return 'never'
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function SettingsScreen(): React.JSX.Element | null {
  const config = useAppStore((s) => s.config)
  const setConfig = useAppStore((s) => s.setConfig)
  const binaries = useAppStore((s) => s.binaries)
  const setBinaries = useAppStore((s) => s.setBinaries)
  const appUpdate = useAppStore((s) => s.appUpdate)
  const [updating, setUpdating] = useState<'yt-dlp' | 'ffmpeg' | 'all' | null>(null)
  const [cookies, setCookies] = useState<CookieInfo | null>(null)
  const [cookieBusy, setCookieBusy] = useState(false)
  const [cookieFailed, setCookieFailed] = useState(false)
  const [checking, setChecking] = useState(false)
  const [appVersion, setAppVersion] = useState<string | null>(null)

  useEffect(() => {
    void window.api.cookies.info().then(setCookies)
  }, [])

  useEffect(() => {
    void window.api.system.appVersion().then(setAppVersion)
  }, [])

  if (!config) return null

  async function update(partial: Partial<AppConfig>): Promise<void> {
    setConfig(await window.api.config.set(partial))
  }

  async function chooseDir(): Promise<void> {
    const dir = await window.api.system.chooseDir()
    if (dir) await update({ downloadDir: dir })
  }

  async function reset(): Promise<void> {
    setConfig(await window.api.config.reset())
    setCookies(await window.api.cookies.info())
  }

  async function updateBinary(which: 'yt-dlp' | 'ffmpeg' | 'all'): Promise<void> {
    setUpdating(which)
    try {
      await window.api.binaries.update(which)
      setBinaries(await window.api.binaries.status())
    } finally {
      setUpdating(null)
    }
  }

  async function setCookieBrowser(browser: string): Promise<void> {
    setCookieBusy(true)
    setCookieFailed(false)
    try {
      const info = await window.api.cookies.set(browser)
      setCookies(info)
      setConfig(await window.api.config.get())
      // Selecting a browser triggers an export. If nothing got cached but a
      // browser was resolvable, it was almost certainly locked/running.
      setCookieFailed(Boolean(info.effectiveBrowser) && !info.cached)
    } finally {
      setCookieBusy(false)
    }
  }

  async function refreshCookies(): Promise<void> {
    setCookieBusy(true)
    setCookieFailed(false)
    try {
      const info = await window.api.cookies.refresh()
      setCookies(info)
      setCookieFailed(Boolean(info.effectiveBrowser) && !info.cached)
    } finally {
      setCookieBusy(false)
    }
  }

  async function clearCookies(): Promise<void> {
    setCookieBusy(true)
    setCookieFailed(false)
    try {
      setCookies(await window.api.cookies.clear())
      setConfig(await window.api.config.get())
    } finally {
      setCookieBusy(false)
    }
  }

  async function checkForUpdate(): Promise<void> {
    setChecking(true)
    try {
      await window.api.appUpdate.check()
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="text-lg font-semibold">Settings</h1>

      <Section title="Downloads">
        <Field label="Download folder">
          <div className="flex gap-2">
            <input
              readOnly
              value={config.downloadDir}
              className="min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-[#12151c] px-3 py-2 text-sm text-white/70 outline-none"
            />
            <button
              onClick={chooseDir}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:border-white/20"
            >
              <FolderOpen size={15} />
              Browse
            </button>
          </div>
        </Field>

        <Field label="Default preset">
          <Select
            value={config.defaultPreset}
            onChange={(v) => update({ defaultPreset: v })}
            options={PRESETS.map((p) => ({ value: p.id, label: p.label }))}
          />
        </Field>

        <Field
          label="Default container"
          description="Video downloads always include the best available audio, merged in automatically."
        >
          <Toggles
            value={config.videoContainer}
            options={CONTAINERS}
            onChange={(v) => update({ videoContainer: v as VideoContainer })}
          />
        </Field>

        <Field label="Concurrent downloads">
          <Slider
            value={config.maxConcurrentDownloads}
            min={1}
            max={8}
            onChange={(v) => update({ maxConcurrentDownloads: v })}
          />
        </Field>

        <Field label="Output template">
          <input
            value={config.outputTemplate}
            onChange={(e) => update({ outputTemplate: e.target.value })}
            className="w-full rounded-lg border border-white/10 bg-[#12151c] px-3 py-2 text-sm outline-none"
          />
        </Field>

        <Field
          label="Playlist fetch limit"
          description="Max items to load when resolving a playlist or mix. Large Mix/radio lists resolve slowly - keep this modest. Set 0 for no limit."
        >
          <input
            type="number"
            min={0}
            max={5000}
            value={config.playlistFetchLimit}
            onChange={(e) =>
              update({ playlistFetchLimit: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
            }
            className="w-full rounded-lg border border-white/10 bg-[#12151c] px-3 py-2 text-sm outline-none"
          />
        </Field>
      </Section>

      <Section title="Post-processing">
        <Check
          label="Embed thumbnail"
          description="Save the video thumbnail as cover art inside the file."
          checked={config.embedThumbnail}
          onChange={(v) => update({ embedThumbnail: v })}
        />
        <Check
          label="Embed metadata"
          description="Write title, uploader, and date into the file's tags."
          checked={config.embedMetadata}
          onChange={(v) => update({ embedMetadata: v })}
        />
        <Check
          label="Embed chapters"
          description="Include YouTube chapter markers when available."
          checked={config.embedChapters}
          onChange={(v) => update({ embedChapters: v })}
        />
        <Check
          label="Write subtitles"
          description="Download available subtitles alongside the video."
          checked={config.writeSubtitles}
          onChange={(v) => update({ writeSubtitles: v })}
        />
        {config.writeSubtitles && (
          <Field label="Subtitle languages (comma-separated)">
            <input
              value={config.subtitleLangs.join(', ')}
              onChange={(e) =>
                update({
                  subtitleLangs: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                })
              }
              placeholder="en, es, fr"
              className="w-full rounded-lg border border-white/10 bg-[#12151c] px-3 py-2 text-sm outline-none placeholder:text-white/25"
            />
          </Field>
        )}
        <Check
          label="Remove sponsored segments (SponsorBlock)"
          description="Automatically cut sponsor, intro, and outro segments."
          checked={config.sponsorBlock}
          onChange={(v) => update({ sponsorBlock: v })}
        />
        <Check
          label="Skip already-downloaded (archive)"
          description="Keep a record so re-running a playlist skips finished items."
          checked={config.useDownloadArchive}
          onChange={(v) => update({ useDownloadArchive: v })}
        />
      </Section>

      <Section title="Cookies">
        <Field
          label="Import cookies from browser"
          description="Lets the app download private, age-restricted, and members-only videos by reusing your signed-in browser session."
        >
          <Select
            value={config.cookiesFromBrowser ?? ''}
            onChange={setCookieBrowser}
            options={[
              { value: '', label: 'Disabled' },
              { value: 'auto', label: 'Auto-detect' },
              ...(cookies?.detected ?? []).map((b) => ({ value: b.name, label: b.label }))
            ]}
          />
        </Field>

        {cookies && cookies.detected.length === 0 ? (
          <CookieNote tone="warn">
            No supported browsers detected on this machine, so cookies can&apos;t be
            imported.
          </CookieNote>
        ) : config.cookiesFromBrowser ? (
          <>
            <CookieStatus cookies={cookies} busy={cookieBusy} failed={cookieFailed} />

            <CookieNote tone="info">
              Tip: close
              {cookies?.effectiveLabel ? ` ${cookies.effectiveLabel}` : ' your browser'}{' '}
              completely before refreshing - a running browser locks its cookie database
              and the import will fail.
            </CookieNote>

            {cookieFailed && (
              <CookieNote tone="warn">
                Couldn&apos;t read cookies. Make sure
                {cookies?.effectiveLabel ? ` ${cookies.effectiveLabel}` : ' your browser'}{' '}
                is fully closed (check the system tray), then press Refresh.
              </CookieNote>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={refreshCookies}
                disabled={cookieBusy}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:border-white/20 disabled:opacity-50"
              >
                <RefreshCw size={13} className={cookieBusy ? 'animate-spin' : ''} />
                Refresh
              </button>
              <button
                onClick={clearCookies}
                disabled={cookieBusy}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:border-red-500/40 hover:text-red-300 disabled:opacity-50"
              >
                <Trash2 size={13} />
                Clear
              </button>
            </div>
          </>
        ) : null}
      </Section>

      <Section title="Appearance & updates">
        <Field label="Theme">
          <Toggles
            value={config.theme}
            options={THEMES}
            onChange={(v) => update({ theme: v as Theme })}
          />
        </Field>
        <Check
          label="Auto-update the app"
          checked={config.autoUpdateApp}
          onChange={(v) => update({ autoUpdateApp: v })}
        />
        <Check
          label="Auto-update yt-dlp / ffmpeg"
          checked={config.autoUpdateBinaries}
          onChange={(v) => update({ autoUpdateBinaries: v })}
        />
        <Check
          label="Desktop notification when a download finishes"
          checked={config.notifications}
          onChange={(v) => update({ notifications: v })}
        />
        <Check
          label="Keep running in the tray when the window is closed"
          checked={config.closeToTray}
          onChange={(v) => update({ closeToTray: v })}
        />
      </Section>

      <Section title="Binaries">
        <BinaryRow
          name="yt-dlp"
          version={binaries?.ytdlp.version ?? null}
          busy={updating === 'yt-dlp' || updating === 'all'}
          onUpdate={() => updateBinary('yt-dlp')}
        />
        <BinaryRow
          name="ffmpeg"
          version={binaries?.ffmpeg.version ?? null}
          busy={updating === 'ffmpeg' || updating === 'all'}
          onUpdate={() => updateBinary('ffmpeg')}
        />
      </Section>

      <Section title="App update">
        <AppUpdatePanel
          status={appUpdate}
          checking={checking}
          onCheck={checkForUpdate}
          onDownload={() => window.api.appUpdate.download()}
          onInstall={() => window.api.appUpdate.install()}
        />
      </Section>

      <Section title="About">
        <AboutPanel version={appVersion} />
      </Section>

      <button
        onClick={reset}
        className="flex items-center gap-2 self-start rounded-lg border border-white/10 px-3 py-2 text-sm text-white/60 hover:border-red-500/40 hover:text-red-300"
      >
        <RotateCcw size={15} />
        Reset to defaults
      </button>
    </div>
  )
}

function Section({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
      <h2 className="mb-4 text-sm font-semibold text-white/70">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Field({
  label,
  description,
  children
}: {
  label: string
  description?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-white/50">{label}</label>
      {description && <p className="-mt-1 text-xs text-white/30">{description}</p>}
      {children}
    </div>
  )
}

function Toggles({
  value,
  options,
  onChange
}: {
  value: string
  options: readonly string[]
  onChange: (value: string) => void
}): React.JSX.Element {
  return (
    <div className="flex gap-2">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`rounded-lg border px-3 py-1.5 text-xs capitalize ${
            value === o
              ? 'border-red-500/50 bg-red-500/10 text-red-300'
              : 'border-white/10 text-white/60 hover:border-white/20'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

function Check({
  label,
  description,
  checked,
  onChange
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (value: boolean) => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 text-left"
    >
      <span className="min-w-0">
        <span className="block text-sm text-white/80">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs text-white/35">{description}</span>
        )}
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-red-500' : 'bg-white/15'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  )
}

function Slider({
  value,
  min,
  max,
  suffix,
  onChange
}: {
  value: number
  min: number
  max: number
  suffix?: string
  onChange: (value: number) => void
}): React.JSX.Element {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: `linear-gradient(to right, rgb(239 68 68) ${pct}%, rgba(255,255,255,0.12) ${pct}%)`
        }}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full outline-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow"
      />
      <span className="w-14 shrink-0 text-right text-sm tabular-nums text-white/70">
        {value}
        {suffix ? ` ${suffix}` : ''}
      </span>
    </div>
  )
}

function BinaryRow({
  name,
  version,
  busy,
  onUpdate
}: {
  name: string
  version: string | null
  busy: boolean
  onUpdate: () => void
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <div className="text-sm">
        <span className="font-medium">{name}</span>
        <span className="ml-2 text-white/40">{version ?? 'not installed'}</span>
      </div>
      <button
        onClick={onUpdate}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:border-white/20 disabled:opacity-50"
      >
        <RefreshCw size={13} className={busy ? 'animate-spin' : ''} />
        {busy ? 'Updating…' : 'Update'}
      </button>
    </div>
  )
}

function AppUpdatePanel({
  status,
  checking,
  onCheck,
  onDownload,
  onInstall
}: {
  status: AppUpdateStatus | null
  checking: boolean
  onCheck: () => void
  onDownload: () => void
  onInstall: () => void
}): React.JSX.Element {
  const state = status?.state ?? 'idle'
  const label: Record<string, string> = {
    idle: 'Not checked yet',
    checking: 'Checking for updates…',
    'up-to-date': 'You are on the latest version',
    available: `Update available${status?.version ? ` (v${status.version})` : ''}`,
    downloading: `Downloading… ${status?.percent ?? 0}%`,
    downloaded: 'Update ready to install',
    error: status?.error ?? 'Update error'
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span
          className={`text-sm ${state === 'error' ? 'text-red-300' : 'text-white/70'}`}
        >
          {label[state]}
        </span>
        {state === 'available' ? (
          <button
            onClick={onDownload}
            className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
          >
            <Download size={13} />
            Download
          </button>
        ) : state === 'downloaded' ? (
          <button
            onClick={onInstall}
            className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
          >
            <RotateCcw size={13} />
            Restart & install
          </button>
        ) : (
          <button
            onClick={onCheck}
            disabled={checking || state === 'checking'}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:border-white/20 disabled:opacity-50"
          >
            <RefreshCw
              size={13}
              className={checking || state === 'checking' ? 'animate-spin' : ''}
            />
            Check for updates
          </button>
        )}
      </div>
      {state === 'downloading' && (
        <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full bg-red-500 transition-all"
            style={{ width: `${status?.percent ?? 0}%` }}
          />
        </div>
      )}
    </div>
  )
}

const REPO_URL = 'https://github.com/molexxxx/youtube-downloader'
const AUTHOR_URL = 'https://github.com/molexxxx'
const BUG_REPORT_URL = `${REPO_URL}/issues/new?template=bug_report.yml`
const FEATURE_REQUEST_URL = `${REPO_URL}/issues/new?template=feature_request.yml`

/** Cookies are refreshed in the background once older than 7 days. */
const COOKIE_STALE_MS = 7 * 24 * 60 * 60 * 1000

function CookieStatus({
  cookies,
  busy,
  failed
}: {
  cookies: CookieInfo | null
  busy: boolean
  failed: boolean
}): React.JSX.Element {
  const using = cookies?.effectiveLabel
  const stale = cookies?.ageMs != null && cookies.ageMs > COOKIE_STALE_MS

  let icon = <Loader2 size={14} className="animate-spin text-white/50" />
  let text = 'Importing cookies…'
  let tone = 'text-white/60'

  if (!busy) {
    if (failed || (!cookies?.cached && cookies?.effectiveBrowser)) {
      icon = <AlertTriangle size={14} className="text-amber-400" />
      text = 'No cookies imported yet'
      tone = 'text-amber-300'
    } else if (cookies?.cached) {
      icon = stale ? (
        <RefreshCw size={14} className="text-amber-400" />
      ) : (
        <CheckCircle2 size={14} className="text-emerald-400" />
      )
      text = stale
        ? `Cookies ready - refreshing soon (imported ${formatAge(cookies.ageMs)})`
        : `Cookies ready (imported ${formatAge(cookies.ageMs)})`
      tone = stale ? 'text-amber-300' : 'text-emerald-300'
    }
  }

  return (
    <div className="space-y-1">
      <div className={`flex items-center gap-2 text-xs ${tone}`}>
        {icon}
        <span>{text}</span>
      </div>
      {using && !busy && <p className="pl-6 text-xs text-white/35">Using {using}.</p>}
    </div>
  )
}

function CookieNote({
  tone,
  children
}: {
  tone: 'info' | 'warn'
  children: React.ReactNode
}): React.JSX.Element {
  const styles =
    tone === 'warn'
      ? 'border-amber-500/30 bg-amber-500/5 text-amber-200/90'
      : 'border-white/10 bg-white/[0.02] text-white/45'
  const Icon = tone === 'warn' ? AlertTriangle : Info
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${styles}`}>
      <Icon size={13} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

function AboutPanel({ version }: { version: string | null }): React.JSX.Element {
  const open = (url: string) => () => void window.api.system.openExternal(url)

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-white/80 selectable">YouTube Downloader</span>
        <span className="text-xs text-white/40 selectable">
          {version ? `v${version}` : ''}
        </span>
      </div>

      <p className="text-xs text-white/40">
        Built by{' '}
        <button
          onClick={open(AUTHOR_URL)}
          className="font-medium text-red-300 hover:text-red-200 hover:underline"
        >
          Tony Wiedman
        </button>
        .
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={open(REPO_URL)}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:border-white/20"
        >
          <Code2 size={14} />
          GitHub repository
          <ExternalLink size={12} className="text-white/30" />
        </button>
        <button
          onClick={open(BUG_REPORT_URL)}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:border-white/20"
        >
          <Bug size={14} className="text-red-400" />
          Report a bug
          <ExternalLink size={12} className="text-white/30" />
        </button>
        <button
          onClick={open(FEATURE_REQUEST_URL)}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:border-white/20"
        >
          <Lightbulb size={14} className="text-amber-400" />
          Request a feature
          <ExternalLink size={12} className="text-white/30" />
        </button>
      </div>
    </div>
  )
}
