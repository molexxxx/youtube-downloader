import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Download,
  Loader2,
  RotateCcw,
  Search,
  X
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
  muted: 'text-white/40',
  ok: 'text-emerald-300',
  warn: 'text-amber-300',
  error: 'text-red-300'
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

/** First-run setup, also opened from Settings: find, choose, install, and self-test yt-dlp and FFmpeg. */
export function SetupGate(): React.JSX.Element {
  const binaries = useAppStore((s) => s.binaries)
  const binariesReady = useAppStore((s) => s.binariesReady)
  const config = useAppStore((s) => s.config)
  const setBinaries = useAppStore((s) => s.setBinaries)
  const setConfig = useAppStore((s) => s.setConfig)
  const setSetupOpen = useAppStore((s) => s.setSetupOpen)
  const [step, setStep] = useState<Step>('scanning')
  const [scan, setScan] = useState<BinariesScan | null>(null)
  const [choice, setChoice] = useState<Choice>({ ytdlp: 'app', ffmpeg: 'app' })
  const startedRef = useRef(false)
  const canCancel = binariesReady && config?.setupComplete === true

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
    setSetupOpen(false)
  }

  return (
    <div className="scroll-thin flex flex-1 justify-center overflow-y-auto p-8">
      <div className="w-full max-w-2xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">
              {step === 'done' ? 'Setup check' : 'Set up yt-dlp and FFmpeg'}
            </h2>
            <p className="mt-1 text-sm text-white/50">
              YouTube Downloader runs two tools. Use the copies the app downloads and
              checks, or ones already on this computer. Every choice is self-tested before
              you start.
            </p>
          </div>
          {canCancel && (
            <button
              onClick={() => setSetupOpen(false)}
              aria-label="Close setup"
              title="Close setup"
              className="btn btn-ghost shrink-0 p-2"
            >
              <X size={16} />
            </button>
          )}
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
            <div className="flex items-center justify-between gap-3">
              <button onClick={rescan} className="btn btn-ghost px-3 py-2 text-xs">
                <RotateCcw size={13} />
                Look again
              </button>
              <button onClick={install} className="btn btn-red px-5 py-2 text-sm">
                <Download size={15} />
                Install and test
              </button>
            </div>
          </>
        )}

        {step === 'installing' && binaries && (
          <div className="space-y-3">
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
            <div className="flex items-center justify-between gap-3">
              <button onClick={rescan} className="btn btn-ghost px-3 py-2 text-xs">
                <ArrowLeft size={13} />
                Change choices
              </button>
              {setupPassed(binaries) ? (
                <button onClick={finish} className="btn btn-red px-5 py-2 text-sm">
                  <CheckCircle2 size={15} />
                  Start using YouTube Downloader
                </button>
              ) : (
                <button onClick={install} className="btn btn-red px-5 py-2 text-sm">
                  <RotateCcw size={15} />
                  Retry
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Busy({
  icon,
  text
}: {
  icon: React.ReactNode
  text: string
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-5 text-sm text-white/60">
      <span className="text-red-400">{icon}</span>
      {text}
      <Loader2 size={14} className="ml-auto animate-spin text-white/30" />
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
      className="space-y-3 rounded-2xl border border-white/5 bg-white/[0.02] p-5"
    >
      <div>
        <h3 className="text-sm font-semibold">{NAMES[which]}</h3>
        <p className="text-xs text-white/40">{PURPOSES[which]}</p>
      </div>
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
        <p className="px-1 text-xs text-white/35">
          {`No ${NAMES[which]} found on this computer's PATH.`}
        </p>
      )}
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
    <div
      className={`rounded-xl border transition-colors duration-150 ${
        checked
          ? 'border-red-500/50 bg-red-500/[0.06]'
          : 'border-white/10 bg-white/[0.015] hover:border-white/20'
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        disabled={disabled}
        onClick={onSelect}
        className="flex w-full items-start gap-3 px-4 py-3 text-left disabled:cursor-not-allowed"
      >
        <span
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 ${
            checked ? 'border-red-400 bg-red-500/20' : 'border-white/20'
          }`}
        >
          {checked && <span className="h-2 w-2 rounded-full bg-red-400" />}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm text-white/80">
            {title}
            {badge && (
              <span className="rounded-full bg-red-500/15 px-2 py-px text-[10px] font-medium text-red-300">
                {badge}
              </span>
            )}
          </span>
          <span className="mt-0.5 block break-words text-xs text-white/45">{body}</span>
        </span>
      </button>
      {footer && <div className="px-4 pb-3 pl-11">{footer}</div>}
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
        className={`flex items-center gap-1.5 text-xs ${TONES[summary.tone]}`}
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
    <div
      className={`space-y-2 rounded-xl border px-4 py-3 ${
        failed ? 'border-red-500/40 bg-red-500/5' : 'border-white/5 bg-white/[0.02]'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-sm">{label}</span>
        {failed ? (
          <AlertTriangle className="text-red-400" size={18} />
        ) : installed && !line.busy ? (
          <CheckCircle2 className="text-emerald-400" size={18} />
        ) : (
          <Loader2 className="animate-spin text-red-400" size={18} />
        )}
      </div>
      {(line.busy || failed) && (
        <p className={`text-xs ${failed ? 'text-red-300' : 'text-white/50'}`}>
          {line.text}
        </p>
      )}
      {line.busy && (
        <div className="h-1 overflow-hidden rounded-full bg-white/5">
          {line.percent === null ? (
            <div className="progress-indeterminate h-full rounded-full bg-red-500/70" />
          ) : (
            <div
              className="h-full rounded-full bg-red-500 transition-[width] duration-200"
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
    <section className="space-y-3 rounded-2xl border border-white/5 bg-white/[0.02] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">
            {NAMES[which]}{' '}
            <span className="font-mono text-xs font-normal text-white/50">
              {target.version ?? ''}
            </span>
          </h3>
          <p className="break-words text-xs text-white/40">
            {sourceLabel(target.source)}
            {target.path ? ` · ${target.path}` : ''}
          </p>
        </div>
        <span className={`shrink-0 text-xs ${TONES[summary.tone]}`}>{summary.text}</span>
      </div>
      {target.selfTest && <SelfTestList report={target.selfTest} />}
    </section>
  )
}
