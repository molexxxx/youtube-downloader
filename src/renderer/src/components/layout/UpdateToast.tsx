import { useState } from 'react'
import { ArrowUpCircle, Download, Loader2, RefreshCw, X } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

/**
 * Global update toast, visible from every view (Settings keeps the full
 * controls and badge). Walks the update through its phases: available ->
 * download, downloading -> progress, downloaded -> restart. Installs are
 * silent: the app quits, updates in the background, and relaunches itself.
 */
export function UpdateToast(): React.JSX.Element | null {
  const status = useAppStore((s) => s.appUpdate)
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const state = status?.state
  const relevant =
    state === 'available' || state === 'downloading' || state === 'downloaded'
  const key = `${state}:${status?.version ?? ''}`
  if (!status || !relevant || dismissedKey === key) return null

  async function download(): Promise<void> {
    setBusy(true)
    try {
      await window.api.appUpdate.download()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="status"
      className="anim-toast-in fixed bottom-4 right-4 z-50 w-80 rounded-2xl border border-white/10 bg-[#12151c]/95 p-3.5 shadow-2xl shadow-black/50 backdrop-blur-md"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-300">
          <ArrowUpCircle size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white/90">
            {state === 'downloaded'
              ? 'Update ready to install'
              : state === 'downloading'
                ? 'Downloading update…'
                : 'Update available'}
          </p>
          <p className="mt-0.5 text-xs text-white/45">
            {status.version ? `Version ${status.version}` : 'A new version was found'}
            {state === 'downloaded' && ' - restarts and installs in the background'}
          </p>
        </div>
        <button
          onClick={() => setDismissedKey(key)}
          aria-label="Dismiss"
          className="shrink-0 rounded p-1 text-white/30 transition-colors hover:bg-white/10 hover:text-white/70"
        >
          <X size={14} />
        </button>
      </div>

      {state === 'downloading' && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            {status.percent != null && status.percent > 0 ? (
              <div
                className="h-full rounded-full bg-red-500 transition-all"
                style={{ width: `${status.percent}%` }}
              />
            ) : (
              <div className="progress-indeterminate h-full rounded-full bg-red-500" />
            )}
          </div>
          {status.percent != null && (
            <p className="mt-1 text-right text-[11px] tabular-nums text-white/40">
              {status.percent}%
            </p>
          )}
        </div>
      )}

      {state === 'available' && (
        <button
          onClick={() => void download()}
          disabled={busy}
          className="btn btn-red mt-3 w-full py-1.5 text-xs"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Download update
        </button>
      )}

      {state === 'downloaded' && (
        <button
          onClick={() => void window.api.appUpdate.install()}
          className="btn btn-red mt-3 w-full py-1.5 text-xs"
        >
          <RefreshCw size={14} />
          Restart & update
        </button>
      )}
    </div>
  )
}
