import { useEffect, useRef, useState } from 'react'
import { Download, Loader2, CheckCircle2 } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

export function SetupGate(): React.JSX.Element {
  const bootstrap = useAppStore((s) => s.bootstrap)
  const binaries = useAppStore((s) => s.binaries)
  const setBinaries = useAppStore((s) => s.setBinaries)
  const [running, setRunning] = useState(false)
  const startedRef = useRef(false)

  useEffect(() => {
    // Kick off bootstrap automatically on first mount, guarding against
    // StrictMode's double-invocation so we only trigger it once.
    if (startedRef.current) return
    startedRef.current = true
    void install()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function install(): Promise<void> {
    setRunning(true)
    try {
      const status = await window.api.binaries.bootstrap()
      setBinaries(status)
    } finally {
      setRunning(false)
    }
  }

  const stageLabel = bootstrap
    ? `${bootstrap.binary}: ${bootstrap.stage}${
        bootstrap.percent != null ? ` ${bootstrap.percent}%` : ''
      }`
    : 'Preparing…'

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-10 text-center">
      <div className="rounded-full bg-red-500/10 p-5">
        {running ? (
          <Loader2 className="animate-spin text-red-400" size={40} />
        ) : (
          <Download className="text-red-400" size={40} />
        )}
      </div>
      <div>
        <h2 className="text-xl font-semibold">Setting things up</h2>
        <p className="mt-1 max-w-md text-sm text-white/50">
          Downloading the latest <code>yt-dlp</code> and <code>ffmpeg</code> engines. This
          happens once and keeps the app self-contained.
        </p>
      </div>

      <div className="w-full max-w-md space-y-3">
        <BinaryRow
          label="yt-dlp"
          installed={Boolean(binaries?.ytdlp.installed)}
          active={bootstrap?.binary === 'yt-dlp'}
        />
        <BinaryRow
          label="ffmpeg"
          installed={Boolean(binaries?.ffmpeg.installed)}
          active={bootstrap?.binary === 'ffmpeg'}
        />
      </div>

      <p className="text-xs text-white/40">{stageLabel}</p>

      {!running && (
        <button
          onClick={install}
          className="rounded-lg bg-red-500 px-5 py-2 text-sm font-medium text-white hover:bg-red-600"
        >
          Retry
        </button>
      )}
    </div>
  )
}

function BinaryRow({
  label,
  installed,
  active
}: {
  label: string
  installed: boolean
  active: boolean
}): React.JSX.Element {
  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
        active ? 'border-red-500/40 bg-red-500/5' : 'border-white/5 bg-white/[0.02]'
      }`}
    >
      <span className="font-mono text-sm">{label}</span>
      {installed ? (
        <CheckCircle2 className="text-emerald-400" size={18} />
      ) : active ? (
        <Loader2 className="animate-spin text-red-400" size={18} />
      ) : (
        <span className="text-xs text-white/30">pending</span>
      )}
    </div>
  )
}
