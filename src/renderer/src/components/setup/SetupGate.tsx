import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Download,
  Loader2,
  RotateCcw,
  Search
} from 'lucide-react'
import type {
  BinariesScan,
  BinariesStatus,
  BinarySource,
  SystemCopy
} from '@shared/types'
import { useAppStore } from '../../stores/appStore'
import {
  describeFfmpeg,
  describeYtdlp,
  selfTestSummary,
  sourceLabel,
  type BinaryLine
} from '../../lib/binaries'
import { formatBytes } from '../../lib/format'
import { SelfTestList } from './SelfTestList'

type Step = 'scanning' | 'choose' | 'installing' | 'testing' | 'done'
type Which = 'ytdlp' | 'ffmpeg'
type Choice = Record<Which, BinarySource>

const NAMES: Record<Which, string> = { ytdlp: 'yt-dlp', ffmpeg: 'FFmpeg' }
const PURPOSES: Record<Which, string> = {
  ytdlp: 'Reads links and downloads from YouTube and other sites.',
  ffmpeg: 'Merges, converts, and tags downloads, and plays audio in Discord.'
}

const TONES = {
  muted: 'text-[var(--t-faint)]',
  ok: 'text-[var(--t-ok)]',
  warn: 'text-[var(--t-warn)]',
  error: 'text-[var(--t-red)]'
} as const

/** The choice setup starts with: the saved source when that copy is still found and passing, else the app's copy. */
export function initialChoice(scan: BinariesScan, saved: Partial<Choice>): Choice {
  const pick = (which: Which): BinarySource =>
    saved[which] === 'system' && scan[which]?.report.passed ? 'system' : 'app'
  return { ytdlp: pick('ytdlp'), ffmpeg: pick('ffmpeg') }
}

/** Whether setup can finish: both binaries are in use and passed every required check. */
export function setupPassed(status: BinariesStatus | null): boolean {
  return (
    status !== null &&
    status.ytdlp.installed &&
    status.ffmpeg.installed &&
    status.ytdlp.selfTest?.passed === true &&
    status.ffmpeg.selfTest?.passed === true
  )
}

/**
 * One-time setup: find, choose, install, and self-test yt-dlp and FFmpeg. It
 * shows on first run, and again only when a tool goes missing; afterward the
 * sources are managed in Settings.
 */
export function SetupGate(): React.JSX.Element {
  const binaries = useAppStore((s) => s.binaries)
  const config = useAppStore((s) => s.config)
  const setBinaries = useAppStore((s) => s.setBinaries)
  const setConfig = useAppStore((s) => s.setConfig)
  const [step, setStep] = useState<Step>('scanning')
  const [scan, setScan] = useState<BinariesScan | null>(null)
  const [choice, setChoice] = useState<Choice>({ ytdlp: 'app', ffmpeg: 'app' })
  const startedRef = useRef(false)

  useEffect(() => {
    // StrictMode mounts twice in development; scan only once.
    if (startedRef.current) return
    startedRef.current = true
    void rescan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function rescan(): Promise<void> {
    setStep('scanning')
    const found = await window.api.binaries.scan()
    setScan(found)
    setChoice(
      initialChoice(found, { ytdlp: config?.ytdlpSource, ffmpeg: config?.ffmpegSource })
    )
    setStep('choose')
  }

  async function install(): Promise<void> {
    setStep('installing')
    setConfig(
      await window.api.config.set({
        ytdlpSource: choice.ytdlp,
        ffmpegSource: choice.ffmpeg
      })
    )
    setBinaries(await window.api.binaries.bootstrap())
    setStep('testing')
    await window.api.binaries.selfTest('ffmpeg')
    setBinaries(await window.api.binaries.selfTest('ytdlp'))
    setStep('done')
  }

  async function finish(): Promise<void> {
    setConfig(await window.api.config.set({ setupComplete: true }))
  }

  return (
    <div className="focus-ring-red signal-red stage scroll-ink scroll-centered flex flex-1 justify-center overflow-y-auto">
      <div className="w-full max-w-[880px] px-10 pb-16 pt-10">
        <header className="border-b border-[var(--t-rule-strong)] pb-5">
          <div>
            <h2 className="display text-[24px]">
              {step === 'done' ? 'Setup check' : 'Set up yt-dlp and FFmpeg'}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--t-dim)]">
              YouTube Downloader runs two tools. Use the copies the app downloads and
              checks, or ones already on this computer. Every choice is self-tested before
              you start.
            </p>
          </div>
        </header>

        {step === 'scanning' && (
          <Busy
            icon={<Search size={18} />}
            text="Looking for yt-dlp and FFmpeg on this computer…"
          />
        )}

        {step === 'choose' && scan && (
          <>
            {(['ytdlp', 'ffmpeg'] as const).map((which) => (
              <ChoiceCard
                key={which}
                which={which}
                scan={scan}
                status={binaries}
                value={choice[which]}
                onChange={(source) => setChoice((c) => ({ ...c, [which]: source }))}
              />
            ))}
            <Actions>
              <button onClick={rescan} className={QUIET_KEY}>
                <RotateCcw size={13} />
                Look again
              </button>
              <button onClick={install} className={PRIMARY_KEY}>
                <Download size={15} />
                Install and test
              </button>
            </Actions>
          </>
        )}

        {step === 'installing' && binaries && (
          <div>
            <ProgressRow
              label="yt-dlp"
              installed={binaries.ytdlp.installed}
              line={describeYtdlp(binaries.ytdlp)}
            />
            <ProgressRow
              label="FFmpeg"
              installed={binaries.ffmpeg.installed}
              line={describeFfmpeg(binaries.ffmpeg)}
            />
          </div>
        )}

        {step === 'testing' && (
          <Busy
            icon={<Loader2 size={18} className="animate-spin" />}
            text="Running the self-tests…"
          />
        )}

        {step === 'done' && binaries && (
          <>
            {(['ytdlp', 'ffmpeg'] as const).map((which) => (
              <ResultCard key={which} which={which} status={binaries} />
            ))}
            <Actions>
              <button onClick={rescan} className={QUIET_KEY}>
                <ArrowLeft size={13} />
                Change choices
              </button>
              {setupPassed(binaries) ? (
                <button onClick={finish} className={PRIMARY_KEY}>
                  <CheckCircle2 size={15} />
                  Start using YouTube Downloader
                </button>
              ) : (
                <button onClick={install} className={PRIMARY_KEY}>
                  <RotateCcw size={15} />
                  Retry
                </button>
              )}
            </Actions>
          </>
        )}
      </div>
    </div>
  )
}

const QUIET_KEY = 'key key-line h-9 px-3 text-[13px]'
const PRIMARY_KEY = 'key key-red h-11 px-5 text-sm'

function Actions({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="mt-8 flex items-center justify-between gap-3">{children}</div>
}

function Busy({
  icon,
  text
}: {
  icon: React.ReactNode
  text: string
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 py-8 text-sm text-[var(--t-dim)]">
      <span className="text-[var(--t-red)]">{icon}</span>
      {text}
      <Loader2 size={14} className="ml-auto animate-spin text-[var(--t-faint)]" />
    </div>
  )
}

function appOffer(
  which: Which,
  scan: BinariesScan,
  status: BinariesStatus | null
): string {
  if (which === 'ytdlp') {
    const installed = status?.ytdlp.source === 'app' ? status.ytdlp.version : null
    if (installed)
      return `Keep yt-dlp ${installed}, which the app installed and keeps up to date.`
    const release = scan.ytdlpRelease
    const size = release?.bytes ? ` (${formatBytes(release.bytes)})` : ''
    return `Download yt-dlp ${release?.version ?? 'stable'}${size} from GitHub, checked against the release's signed checksums and kept up to date.`
  }
  const pinned = status?.ffmpeg.pinned
  if (status?.ffmpeg.source === 'app' && status.ffmpeg.version === pinned?.version) {
    return `Keep FFmpeg ${status.ffmpeg.version}, the build this app version pins.`
  }
  if (!pinned) return 'This app version pins no FFmpeg build for this computer.'
  return `Download FFmpeg ${pinned.version} (${formatBytes(pinned.bytes)}) from ${pinned.publisher}, checked against the SHA-256 this app version pins. New builds arrive with app updates.`
}

function ChoiceCard({
  which,
  scan,
  status,
  value,
  onChange
}: {
  which: Which
  scan: BinariesScan
  status: BinariesStatus | null
  value: BinarySource
  onChange: (source: BinarySource) => void
}): React.JSX.Element {
  const found: SystemCopy | null = scan[which]
  return (
    <section
      role="radiogroup"
      aria-label={NAMES[which]}
      className="grid grid-cols-[180px_minmax(0,1fr)] gap-x-10 border-b border-[var(--t-rule)] py-7"
    >
      <div>
        <h3 className="text-[15px] font-semibold">{NAMES[which]}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--t-dim)]">
          {PURPOSES[which]}
        </p>
      </div>
      <div className="min-w-0 divide-y divide-[var(--t-rule)]">
        <Option
          checked={value === 'app'}
          onSelect={() => onChange('app')}
          title="Use the app's copy"
          badge="Recommended"
          body={appOffer(which, scan, status)}
        />
        {found ? (
          <Option
            checked={value === 'system'}
            disabled={!found.report.passed}
            onSelect={() => onChange('system')}
            title={`Use ${NAMES[which]} ${found.version ?? ''} on this computer`}
            body={found.path}
            footer={<FoundReport copy={found} />}
          />
        ) : (
          <p className="py-3 pl-[34px] text-[13px] text-[var(--t-faint)]">
            {`No ${NAMES[which]} found on this computer's PATH.`}
          </p>
        )}
      </div>
    </section>
  )
}

function Option({
  checked,
  disabled = false,
  onSelect,
  title,
  badge,
  body,
  footer
}: {
  checked: boolean
  disabled?: boolean
  onSelect: () => void
  title: string
  badge?: string
  body: string
  footer?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className={disabled ? 'opacity-60' : ''}>
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        disabled={disabled}
        onClick={onSelect}
        className="flex w-full items-start gap-4 py-3.5 text-left disabled:cursor-not-allowed"
      >
        <span
          className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150 ${
            checked ? 'border-[var(--t-accent)]' : 'border-[var(--t-rule-strong)]'
          }`}
        >
          {checked && <span className="h-2 w-2 rounded-full bg-[var(--t-accent)]" />}
        </span>
        <span className="min-w-0">
          <span
            className={`flex items-center gap-2 text-sm font-semibold transition-colors duration-150 ${
              checked ? 'text-[var(--t-fg)]' : 'text-[var(--t-dim)]'
            }`}
          >
            {title}
            {badge && (
              <span className="rounded-sm bg-[var(--t-accent-soft)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--t-accent-text)]">
                {badge}
              </span>
            )}
          </span>
          <span className="mt-1 block break-words text-[13px] leading-relaxed text-[var(--t-dim)]">
            {body}
          </span>
        </span>
      </button>
      {footer && <div className="pb-3.5 pl-[34px]">{footer}</div>}
    </div>
  )
}

function FoundReport({ copy }: { copy: SystemCopy }): React.JSX.Element {
  const [open, setOpen] = useState(!copy.report.passed)
  const summary = selfTestSummary(copy.report)
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex items-center gap-1.5 text-[13px] ${TONES[summary.tone]}`}
      >
        {summary.text}
        <ChevronDown
          size={12}
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <SelfTestList report={copy.report} />}
    </div>
  )
}

function ProgressRow({
  label,
  installed,
  line
}: {
  label: string
  installed: boolean
  line: BinaryLine
}): React.JSX.Element {
  const failed = line.tone === 'error'
  return (
    <div className="space-y-2 border-b border-[var(--t-rule)] py-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[15px] font-semibold">{label}</span>
        {failed ? (
          <AlertTriangle className="text-[var(--t-red)]" size={18} />
        ) : installed && !line.busy ? (
          <CheckCircle2 className="text-[var(--t-ok)]" size={18} />
        ) : (
          <Loader2 className="animate-spin text-[var(--t-red)]" size={18} />
        )}
      </div>
      {(line.busy || failed) && (
        <p
          className={`text-[13px] ${failed ? 'text-[var(--t-red)]' : 'text-[var(--t-dim)]'}`}
        >
          {line.text}
        </p>
      )}
      {line.busy && (
        <div className="h-1 overflow-hidden bg-[var(--t-rule)]">
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

function ResultCard({
  which,
  status
}: {
  which: Which
  status: BinariesStatus
}): React.JSX.Element {
  const target = status[which]
  const summary = target.installed
    ? selfTestSummary(target.selfTest)
    : {
        text: (which === 'ytdlp'
          ? describeYtdlp(status.ytdlp)
          : describeFfmpeg(status.ffmpeg)
        ).text,
        tone: 'error' as const
      }
  return (
    <section className="space-y-4 border-b border-[var(--t-rule)] py-6">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold">
            {NAMES[which]}{' '}
            <span className="font-mono text-[13px] font-normal text-[var(--t-dim)]">
              {target.version ?? ''}
            </span>
          </h3>
          <p className="mt-1 break-words text-[13px] text-[var(--t-dim)]">
            {sourceLabel(target.source)}
            {target.path ? ` · ${target.path}` : ''}
          </p>
        </div>
        <span className={`shrink-0 text-[13px] font-semibold ${TONES[summary.tone]}`}>
          {summary.text}
        </span>
      </div>
      {target.selfTest && (
        <div className="border-l-2 border-[var(--t-rule-strong)] pl-4">
          <SelfTestList report={target.selfTest} />
        </div>
      )}
    </section>
  )
}
