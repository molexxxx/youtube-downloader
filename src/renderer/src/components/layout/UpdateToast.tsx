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
      className="anim-toast-in sheet signal-red focus-ring-red fixed bottom-4 right-4 z-50 w-80 rounded-sm border border-[var(--t-rule-strong)] p-4 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.55)]"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-[var(--t-accent-soft)] text-[var(--t-accent-text)]">
          <ArrowUpCircle size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {state === 'downloaded'
              ? 'Update ready to install'
              : state === 'downloading'
                ? 'Downloading update…'
                : 'Update available'}
          </p>
          <p className="mt-0.5 text-[13px] text-[var(--t-dim)]">
            {status.version ? `Version ${status.version}` : 'A new version was found'}
            {state === 'downloaded' && ' - restarts and installs in the background'}
          </p>
        </div>
        <button
          onClick={() => setDismissedKey(key)}
          aria-label="Dismiss"
          className="shrink-0 rounded-sm p-1 text-[var(--t-dim)] transition-colors hover:bg-[var(--t-hover)] hover:text-[var(--t-fg)]"
        >
          <X size={14} />
        </button>
      </div>

      {state === 'downloading' && (
        <div className="mt-3">
          <div className="h-1 overflow-hidden bg-[var(--t-rule)]">
            {status.percent != null && status.percent > 0 ? (
              <div
                className="h-full bg-[var(--t-accent)] transition-[width] duration-200"
                style={{ width: `${status.percent}%` }}
              />
            ) : (
              <div className="progress-indeterminate h-full bg-[var(--t-accent)]" />
            )}
          </div>
          {status.percent != null && (
            <p className="mt-1 text-right text-[11px] tabular-nums text-[var(--t-dim)]">
              {status.percent}%
            </p>
          )}
        </div>
      )}

      {state === 'available' && (
        <button
          onClick={() => void download()}
          disabled={busy}
          className="key key-red mt-3 h-9 w-full text-[13px]"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Download update
        </button>
      )}

      {state === 'downloaded' && (
        <button
          onClick={() => void window.api.appUpdate.install()}
          className="key key-red mt-3 h-9 w-full text-[13px]"
        >
          <RefreshCw size={14} />
          Restart & update
        </button>
      )}
    </div>
  )
}
