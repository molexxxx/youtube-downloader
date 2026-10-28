import { useEffect, useId, useState } from 'react'
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
  Search,
  ShieldCheck,
  Trash2
} from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { PRESETS } from '@shared/presets'
import type {
  AppConfig,
  AppUpdateStatus,
  BinariesScan,
  BinariesStatus,
  BinarySource,
  CookieInfo,
  SelfTestReport,
  Theme,
  VideoContainer
} from '@shared/types'
import { Select } from '../shared/Select'
import { Segmented } from '../shared/Segmented'
import {
  describeFfmpeg,
  describeYtdlp,
  selfTestSummary,
  sourceLabel,
  type BinaryLine
} from '../../lib/binaries'
import { SelfTestList } from '../setup/SelfTestList'

const THEMES: Theme[] = ['system', 'dark', 'light']
const CONTAINERS: VideoContainer[] = ['mp4', 'mkv']

/** Boxed text input matching the line-tone Select trigger. */
const INPUT =
  'w-full rounded-sm border border-[var(--t-rule-strong)] bg-transparent px-3 py-2.5 text-sm text-[var(--t-fg)] outline-none transition-colors placeholder:text-[var(--t-faint)] hover:border-[var(--t-dim)] focus:border-[var(--t-accent)]'

const SMALL_KEY = 'key key-line h-8 shrink-0 px-3 text-[13px]'

function formatAge(ms: number | null): string {
  if (ms == null) return 'never'
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/**
 * App settings as a ruled ledger on the stage: each section title holds the
 * left column while its rows run down the right. Every change saves at once.
 */
export function SettingsScreen(): React.JSX.Element | null {
  const config = useAppStore((s) => s.config)
  const setConfig = useAppStore((s) => s.setConfig)
  const binaries = useAppStore((s) => s.binaries)
  const setBinaries = useAppStore((s) => s.setBinaries)
  const appUpdate = useAppStore((s) => s.appUpdate)
  const binaryChange = useAppStore((s) => s.binaryChange)
  const setBinaryChange = useAppStore((s) => s.setBinaryChange)
  const [scan, setScan] = useState<BinariesScan | null>(null)
  const [scanning, setScanning] = useState(false)
  const [checkingYtdlp, setCheckingYtdlp] = useState(false)
  const [testing, setTesting] = useState<'ytdlp' | 'ffmpeg' | null>(null)
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

  useEffect(() => {
    void lookForCopies()
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

  async function checkYtdlp(): Promise<void> {
    setCheckingYtdlp(true)
    try {
      setBinaries(await window.api.binaries.checkYtdlp())
    } finally {
      setCheckingYtdlp(false)
    }
  }

  async function lookForCopies(): Promise<void> {
    setScanning(true)
    try {
      setScan(await window.api.binaries.scan())
    } finally {
      setScanning(false)
    }
  }

  /** Installs whatever the current sources need, then self-tests the tool that changed. */
  async function applyTool(which: Tool, partial?: Partial<AppConfig>): Promise<void> {
    setBinaryChange(which)
    try {
      if (partial) setConfig(await window.api.config.set(partial))
      const status = await window.api.binaries.bootstrap()
      setBinaries(status)
      if (status[which].installed) {
        setTesting(which)
        setBinaries(await window.api.binaries.selfTest(which))
      }
    } finally {
      setTesting(null)
      setBinaryChange(null)
    }
  }

  /** Switches one tool between the app's copy and the one on this computer, in place. */
  function switchSource(which: Tool, source: BinarySource): Promise<void> {
    return applyTool(
      which,
      which === 'ytdlp' ? { ytdlpSource: source } : { ffmpegSource: source }
    )
  }

  async function runSelfTest(which: 'ytdlp' | 'ffmpeg'): Promise<void> {
    setTesting(which)
    try {
      setBinaries(await window.api.binaries.selfTest(which))
    } finally {
      setTesting(null)
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
    <div className="mx-auto w-full max-w-[1040px] px-10 pb-16 pt-8">
      <div className="flex items-end justify-between gap-4 border-b border-[var(--t-rule-strong)] pb-4">
        <div>
          <h1 className="display text-[24px]">Settings</h1>
          <p className="mt-2 text-sm text-[var(--t-dim)]">
            Changes save as you make them.
          </p>
        </div>
        <button
          onClick={reset}
          className="key key-line h-9 shrink-0 px-3 text-[13px] hover:text-[var(--t-red)]"
        >
          <RotateCcw size={14} />
          Reset to defaults
        </button>
      </div>

      <div className="divide-y divide-[var(--t-rule)]">
        <Section title="Downloads">
          <Field label="Download folder" stacked>
            <div className="flex gap-2">
              <input
                readOnly
                value={config.downloadDir}
                className={`${INPUT} min-w-0 flex-1 truncate`}
              />
              <button
                onClick={chooseDir}
                className="key key-line h-[42px] shrink-0 px-4 text-sm"
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
            width="w-40"
          >
            <Segmented
              label="Default container"
              size="sm"
              uppercase
              value={config.videoContainer}
              options={CONTAINERS.map((c) => ({ value: c, label: c }))}
              onChange={(v) => update({ videoContainer: v })}
            />
          </Field>

          <Field label="Concurrent downloads">
            <Slider
              label="Concurrent downloads"
              value={config.maxConcurrentDownloads}
              min={1}
              max={8}
              onChange={(v) => update({ maxConcurrentDownloads: v })}
            />
          </Field>

          <Field label="Output template" stacked>
            <input
              value={config.outputTemplate}
              onChange={(e) => update({ outputTemplate: e.target.value })}
              className={`${INPUT} font-mono text-[13px]`}
            />
          </Field>

          <Field
            label="Playlist fetch limit"
            description="Max items to load when resolving a playlist or mix. Large Mix/radio lists resolve slowly - keep this modest. Set 0 for no limit."
            width="w-28"
          >
            <input
              type="number"
              min={0}
              max={5000}
              value={config.playlistFetchLimit}
              onChange={(e) =>
                update({
                  playlistFetchLimit: Math.max(0, Math.floor(Number(e.target.value) || 0))
                })
              }
              className={`${INPUT} tabular-nums`}
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
            <Field label="Subtitle languages (comma-separated)" stacked>
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
                className={INPUT}
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
                ...(cookies?.detected ?? []).map((b) => ({
                  value: b.name,
                  label: b.label
                }))
              ]}
            />
          </Field>

          {cookies && cookies.detected.length === 0 ? (
            <div className="py-4">
              <CookieNote tone="warn">
                No supported browsers detected on this machine, so cookies can&apos;t be
                imported.
              </CookieNote>
            </div>
          ) : config.cookiesFromBrowser ? (
            <div className="space-y-3 py-4">
              <div className="flex items-start justify-between gap-6">
                <CookieStatus cookies={cookies} busy={cookieBusy} failed={cookieFailed} />
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={refreshCookies}
                    disabled={cookieBusy}
                    className={SMALL_KEY}
                  >
                    <RefreshCw size={13} className={cookieBusy ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                  <button
                    onClick={clearCookies}
                    disabled={cookieBusy}
                    className={`${SMALL_KEY} hover:text-[var(--t-red)]`}
                  >
                    <Trash2 size={13} />
                    Clear
                  </button>
                </div>
              </div>

              <CookieNote tone="info">
                Tip: close
                {cookies?.effectiveLabel
                  ? ` ${cookies.effectiveLabel}`
                  : ' your browser'}{' '}
                completely before refreshing - a running browser locks its cookie database
                and the import will fail.
              </CookieNote>

              {cookieFailed && (
                <CookieNote tone="warn">
                  Couldn&apos;t read cookies. Make sure
                  {cookies?.effectiveLabel
                    ? ` ${cookies.effectiveLabel}`
                    : ' your browser'}{' '}
                  is fully closed (check the system tray), then press Refresh.
                </CookieNote>
              )}
            </div>
          ) : null}
        </Section>

        <Section title="Appearance & updates">
          <Field label="Theme">
            <Segmented
              label="Theme"
              size="sm"
              capitalize
              value={config.theme}
              options={THEMES.map((t) => ({ value: t, label: t }))}
              onChange={(v) => update({ theme: v })}
            />
          </Field>
          <Check
            label="Auto-update the app"
            checked={config.autoUpdateApp}
            onChange={(v) => update({ autoUpdateApp: v })}
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
          <Check
            label="Launch on system startup"
            description="Start the app automatically when you log in - handy for keeping the Discord bot online."
            checked={config.launchOnStartup}
            onChange={(v) => update({ launchOnStartup: v })}
          />
          {config.launchOnStartup && (
            <Check
              label="Start minimized to the tray"
              description="When launched at login, start hidden in the tray instead of opening the window."
              checked={config.startMinimized}
              onChange={(v) => update({ startMinimized: v })}
            />
          )}
        </Section>

        <Section title="yt-dlp & FFmpeg">
          {binaries && (
            <>
              <div className="space-y-3 py-4">
                <BinaryRow
                  name="yt-dlp"
                  version={binaries.ytdlp.version}
                  detail={sourceLabel(binaries.ytdlp.source)}
                  line={describeYtdlp(binaries.ytdlp)}
                  action={
                    !binaries.ytdlp.installed && config.ytdlpSource === 'app' ? (
                      <InstallAgainKey
                        busy={binaryChange !== null}
                        onClick={() => applyTool('ytdlp')}
                      />
                    ) : (
                      binaries.ytdlp.source !== 'system' && (
                        <button
                          onClick={checkYtdlp}
                          disabled={
                            checkingYtdlp ||
                            binaryChange !== null ||
                            describeYtdlp(binaries.ytdlp).busy
                          }
                          title="Look for a new stable yt-dlp release and install it"
                          className={SMALL_KEY}
                        >
                          <RefreshCw
                            size={13}
                            className={checkingYtdlp ? 'animate-spin' : ''}
                          />
                          Check now
                        </button>
                      )
                    )
                  }
                />
                <SelfTestRow
                  report={binaries.ytdlp.selfTest}
                  installed={binaries.ytdlp.installed}
                  busy={testing === 'ytdlp'}
                  onRun={() => runSelfTest('ytdlp')}
                />
              </div>
              <SourceField
                which="ytdlp"
                current={config.ytdlpSource}
                status={binaries}
                scan={scan}
                scanning={scanning}
                changing={binaryChange !== null}
                onChange={(source) => switchSource('ytdlp', source)}
              />
              {binaries.ytdlp.source !== 'system' && (
                <Check
                  label="Install new yt-dlp releases automatically"
                  description="Checked once a day. A release is installed only after it matches the checksums the yt-dlp signing key vouches for."
                  checked={config.autoUpdateYtdlp}
                  onChange={(v) => update({ autoUpdateYtdlp: v })}
                />
              )}
              <div className="space-y-3 py-4">
                <BinaryRow
                  name="FFmpeg"
                  version={
                    binaries.ffmpeg.version ??
                    (binaries.ffmpeg.installed ? 'earlier download' : null)
                  }
                  detail={
                    binaries.ffmpeg.source === 'system'
                      ? sourceLabel('system')
                      : binaries.ffmpeg.pinned?.publisher
                  }
                  line={describeFfmpeg(binaries.ffmpeg)}
                  action={
                    !binaries.ffmpeg.installed &&
                    config.ffmpegSource === 'app' && (
                      <InstallAgainKey
                        busy={binaryChange !== null}
                        onClick={() => applyTool('ffmpeg')}
                      />
                    )
                  }
                />
                <SelfTestRow
                  report={binaries.ffmpeg.selfTest}
                  installed={binaries.ffmpeg.installed}
                  busy={testing === 'ffmpeg'}
                  onRun={() => runSelfTest('ffmpeg')}
                />
              </div>
              <SourceField
                which="ffmpeg"
                current={config.ffmpegSource}
                status={binaries}
                scan={scan}
                scanning={scanning}
                changing={binaryChange !== null}
                onChange={(source) => switchSource('ffmpeg', source)}
              />
              <div className="flex items-center justify-between gap-6 py-4">
                <p className="text-[13px] text-[var(--t-dim)]">
                  Copies on this computer are the ones on your PATH, each self-tested
                  before it can be used.
                </p>
                <button
                  onClick={lookForCopies}
                  disabled={scanning || binaryChange !== null}
                  className={SMALL_KEY}
                >
                  {scanning ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Search size={13} />
                  )}
                  Look again
                </button>
              </div>
            </>
          )}
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
      </div>
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
    <section className="grid grid-cols-[200px_minmax(0,1fr)] gap-x-12 py-8">
      <h2 className="sticky top-6 self-start text-[15px] font-semibold">{title}</h2>
      <div className="min-w-0 divide-y divide-[var(--t-rule)] [&>:first-child]:pt-0 [&>:last-child]:pb-0">
        {children}
      </div>
    </section>
  )
}

/**
 * One setting row: label and description on the left with a fixed-width
 * control on the right, or `stacked` for full-width controls such as paths.
 */
function Field({
  label,
  description,
  stacked = false,
  width = 'w-64',
  children
}: {
  label: string
  description?: string
  stacked?: boolean
  width?: string
  children: React.ReactNode
}): React.JSX.Element {
  const id = useId()
  const text = (
    <div className="min-w-0">
      <p id={id} className="text-sm font-semibold">
        {label}
      </p>
      {description && (
        <p className="mt-1 break-words text-[13px] leading-relaxed text-[var(--t-dim)]">
          {description}
        </p>
      )}
    </div>
  )

  if (stacked) {
    return (
      <div className="py-4">
        {text}
        <div role="group" aria-labelledby={id} className="mt-3">
          {children}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-8 py-4">
      {text}
      <div role="group" aria-labelledby={id} className={`${width} shrink-0`}>
        {children}
      </div>
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
    <label className="flex cursor-pointer items-center justify-between gap-8 py-4">
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        {description && (
          <span className="mt-1 block text-[13px] leading-relaxed text-[var(--t-dim)]">
            {description}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="toggle"
      />
    </label>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}): React.JSX.Element {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="flex items-center gap-4">
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: `linear-gradient(90deg, var(--t-accent) ${pct}%, var(--t-rule-strong) ${pct}%)`
        }}
        className="line-range line-range-thin min-w-0 flex-1"
      />
      <span className="w-5 shrink-0 text-right text-sm font-semibold tabular-nums">
        {value}
      </span>
    </div>
  )
}

const LINE_TONES: Record<BinaryLine['tone'], string> = {
  muted: 'text-[var(--t-faint)]',
  busy: 'text-[var(--t-dim)]',
  ok: 'text-[var(--t-ok)]',
  warn: 'text-[var(--t-warn)]',
  error: 'text-[var(--t-red)]'
}

function BinaryRow({
  name,
  version,
  detail,
  line,
  action
}: {
  name: string
  version: string | null
  detail?: string
  line: BinaryLine
  action?: React.ReactNode
}): React.JSX.Element {
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-sm">
            <span className="font-semibold">{name}</span>
            <span className="font-mono text-[13px] text-[var(--t-dim)]">
              {version ?? 'not installed'}
            </span>
            {detail && (
              <span className="text-[13px] text-[var(--t-faint)]">{detail}</span>
            )}
          </p>
          <p
            className={`mt-1 flex items-center gap-1.5 text-[13px] ${LINE_TONES[line.tone]}`}
          >
            {line.busy && <Loader2 size={13} className="shrink-0 animate-spin" />}
            {line.tone === 'error' && <AlertTriangle size={13} className="shrink-0" />}
            <span>{line.text}</span>
          </p>
        </div>
        {action}
      </div>
      {line.busy && (
        <div className="mt-3 h-1 overflow-hidden bg-[var(--t-rule)]">
          {line.percent === null ? (
            <div className="progress-indeterminate h-full bg-[var(--t-accent)]" />
          ) : (
            <div
              className="h-full bg-[var(--t-accent)] transition-[width] duration-200"
              style={{ width: `${line.percent}%` }}
            />
          )}
        </div>
      )}
    </div>
  )
}

const SUMMARY_TONES = {
  muted: 'text-[var(--t-faint)]',
  ok: 'text-[var(--t-ok)]',
  warn: 'text-[var(--t-warn)]',
  error: 'text-[var(--t-red)]'
} as const

type Tool = 'ytdlp' | 'ffmpeg'

const TOOL_NAMES: Record<Tool, string> = { ytdlp: 'yt-dlp', ffmpeg: 'FFmpeg' }

/** What the app's own copy of each tool is, in one sentence. */
const APP_COPY: Record<Tool, string> = {
  ytdlp:
    "The app's copy comes from GitHub, is checked against yt-dlp's signed checksums, and keeps itself up to date.",
  ffmpeg:
    "The app's copy is the FFmpeg build this app version pins, checked by its SHA-256."
}

/** Describes the copy in use and what was found on this computer. */
export function sourceDescription(
  which: Tool,
  current: BinarySource,
  status: BinariesStatus,
  scan: BinariesScan | null,
  scanning: boolean
): string {
  const name = TOOL_NAMES[which]
  if (current === 'system') {
    const path = status[which].path
    return path
      ? `Using ${name} at ${path}.`
      : `Using the ${name} on this computer's PATH.`
  }
  const found = scan?.[which] ?? null
  let local = ''
  if (scanning) local = 'Looking for a copy on this computer…'
  else if (scan && !found) local = `No ${name} on this computer's PATH.`
  else if (found?.report.passed)
    local = `Also found ${name} ${found.version ?? ''} at ${found.path}.`
  else if (found) {
    local = `${name} ${found.version ?? ''} at ${found.path} failed its self-test, so it can't be used.`
  }
  return local ? `${APP_COPY[which]} ${local}` : APP_COPY[which]
}

/** Where a tool runs from: the app's checked copy or the one on this computer, switched in place. */
function SourceField({
  which,
  current,
  status,
  scan,
  scanning,
  changing,
  onChange
}: {
  which: Tool
  current: BinarySource
  status: BinariesStatus
  scan: BinariesScan | null
  scanning: boolean
  changing: boolean
  onChange: (source: BinarySource) => void
}): React.JSX.Element {
  const usable = current === 'system' || Boolean(scan?.[which]?.report.passed)
  return (
    <Field
      label={`Use for ${TOOL_NAMES[which]}`}
      description={sourceDescription(which, current, status, scan, scanning)}
    >
      <Segmented<BinarySource>
        label={`${TOOL_NAMES[which]} source`}
        value={current}
        disabled={changing}
        onChange={(source) => {
          if (source !== current) onChange(source)
        }}
        options={[
          { value: 'app', label: "App's copy" },
          { value: 'system', label: 'This computer', disabled: !usable }
        ]}
      />
    </Field>
  )
}

function InstallAgainKey({
  busy,
  onClick
}: {
  busy: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title="Download and check the app's copy again"
      className={SMALL_KEY}
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
      Install again
    </button>
  )
}

function SelfTestRow({
  report,
  installed,
  busy,
  onRun
}: {
  report: SelfTestReport | null
  installed: boolean
  busy: boolean
  onRun: () => void
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (!installed) return null
  const summary = selfTestSummary(report)
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={report === null}
          aria-expanded={open}
          className={`flex items-center gap-1.5 text-[13px] disabled:cursor-default ${SUMMARY_TONES[summary.tone]}`}
        >
          <ShieldCheck size={14} className="shrink-0" />
          {summary.text}
          {report && (
            <span className="text-[var(--t-faint)]">
              {' '}
              · {open ? 'hide' : 'show'} checks
            </span>
          )}
        </button>
        <button
          onClick={onRun}
          disabled={busy}
          title="Check that it provides everything the app uses"
          className={SMALL_KEY}
        >
          {busy ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <ShieldCheck size={13} />
          )}
          {busy ? 'Testing…' : 'Self-test'}
        </button>
      </div>
      {open && report && (
        <div className="border-l-2 border-[var(--t-rule-strong)] pl-4">
          <SelfTestList report={report} />
        </div>
      )}
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
    <div className="py-4">
      <div className="flex items-center justify-between gap-6">
        <span
          className={`text-sm ${state === 'error' ? 'text-[var(--t-red)]' : 'font-semibold'}`}
        >
          {label[state]}
        </span>
        {state === 'available' ? (
          <button
            onClick={onDownload}
            className="key key-red h-9 shrink-0 px-4 text-[13px]"
          >
            <Download size={14} />
            Download
          </button>
        ) : state === 'downloaded' ? (
          <button
            onClick={onInstall}
            className="key key-red h-9 shrink-0 px-4 text-[13px]"
          >
            <RotateCcw size={14} />
            Restart & install
          </button>
        ) : (
          <button
            onClick={onCheck}
            disabled={checking || state === 'checking'}
            className={SMALL_KEY}
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
        <div className="mt-3 h-1 overflow-hidden bg-[var(--t-rule)]">
          <div
            className="h-full bg-[var(--t-accent)] transition-[width] duration-200"
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

  let icon = <Loader2 size={14} className="animate-spin" />
  let text = 'Importing cookies…'
  let tone = 'text-[var(--t-dim)]'

  if (!busy) {
    if (failed || (!cookies?.cached && cookies?.effectiveBrowser)) {
      icon = <AlertTriangle size={14} />
      text = 'No cookies imported yet'
      tone = 'text-[var(--t-warn)]'
    } else if (cookies?.cached) {
      icon = stale ? <RefreshCw size={14} /> : <CheckCircle2 size={14} />
      text = stale
        ? `Cookies ready - refreshing soon (imported ${formatAge(cookies.ageMs)})`
        : `Cookies ready (imported ${formatAge(cookies.ageMs)})`
      tone = stale ? 'text-[var(--t-warn)]' : 'text-[var(--t-ok)]'
    }
  }

  return (
    <div className="min-w-0">
      <p className={`flex items-center gap-2 text-sm font-semibold ${tone}`}>
        <span className="shrink-0">{icon}</span>
        <span>{text}</span>
      </p>
      {using && !busy && (
        <p className="mt-1 pl-[22px] text-[13px] text-[var(--t-dim)]">Using {using}.</p>
      )}
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
  const Icon = tone === 'warn' ? AlertTriangle : Info
  return (
    <p
      className={`flex items-start gap-2 text-[13px] leading-relaxed ${
        tone === 'warn' ? 'text-[var(--t-warn)]' : 'text-[var(--t-dim)]'
      }`}
    >
      <Icon size={14} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

function AboutPanel({ version }: { version: string | null }): React.JSX.Element {
  const open = (url: string) => () => void window.api.system.openExternal(url)

  return (
    <div className="py-4">
      <p className="flex items-baseline gap-3">
        <span className="selectable text-sm font-semibold">YouTube Downloader</span>
        <span className="selectable font-mono text-[13px] text-[var(--t-dim)]">
          {version ? `v${version}` : ''}
        </span>
      </p>

      <p className="mt-1 text-[13px] text-[var(--t-dim)]">
        Built by{' '}
        <button
          onClick={open(AUTHOR_URL)}
          className="font-semibold text-[var(--t-red)] hover:underline"
        >
          Tony Wiedman
        </button>
        .
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={open(REPO_URL)} className={SMALL_KEY}>
          <Code2 size={14} />
          GitHub repository
          <ExternalLink size={12} className="text-[var(--t-faint)]" />
        </button>
        <button onClick={open(BUG_REPORT_URL)} className={SMALL_KEY}>
          <Bug size={14} className="text-[var(--t-red)]" />
          Report a bug
          <ExternalLink size={12} className="text-[var(--t-faint)]" />
        </button>
        <button onClick={open(FEATURE_REQUEST_URL)} className={SMALL_KEY}>
          <Lightbulb size={14} className="text-[var(--t-warn)]" />
          Request a feature
          <ExternalLink size={12} className="text-[var(--t-faint)]" />
        </button>
      </div>
    </div>
  )
}
