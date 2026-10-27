import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, ListPlus, Loader2, Play, Plus, Search, X } from 'lucide-react'
import type { PlaylistEntry, TrackInput } from '@shared/types'
import { useAppStore } from '../../stores/appStore'
import { formatDuration, looksLikeUrl } from '../../lib/format'
import { LocalFilesPanel } from './LocalFilesPanel'

/**
 * Search YouTube or paste a link/playlist, then add tracks to the active queue.
 * Results drop over the stage as a raised panel (Esc, the X, or clicking
 * anywhere else closes it) so the layout never moves.
 */
export function SearchPanel(): React.JSX.Element | null {
  const guildId = useAppStore((s) => s.activeGuildId)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<PlaylistEntry[]>([])
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!guildId) return null

  const trimmed = query.trim()
  const isUrl = looksLikeUrl(trimmed)
  // Mirrors the downloader's UrlBar: the button names the action it's about to
  // take (Search this text / Resolve this link), not the eventual outcome -
  // queueing is then explicit via Add / Add all on the results, same as there.
  const action = trimmed && !isUrl ? 'Search' : 'Resolve'

  function flash(message: string): void {
    setNotice(message)
    setError(null)
    window.setTimeout(() => setNotice(null), 3000)
  }

  async function enqueue(inputs: TrackInput[], label: string): Promise<void> {
    if (inputs.length === 0) return
    await window.api.discord.enqueue(guildId!, inputs)
    flash(label)
  }

  async function submit(): Promise<void> {
    const q = query.trim()
    if (!q) return
    setBusy(true)
    setError(null)
    try {
      if (looksLikeUrl(q)) {
        setOpen(false)
        setResults([])
        const info = await window.api.extract.info(q)
        if (info.isPlaylist) {
          const inputs = info.entries
            .filter((e) => e.url)
            .map((e) => ({
              title: e.title,
              url: e.url,
              duration: e.duration,
              thumbnail: e.thumbnail,
              uploader: e.uploader
            }))
          await enqueue(inputs, `Added ${inputs.length} tracks from playlist`)
        } else {
          await enqueue(
            [
              {
                title: info.title,
                url: info.webpageUrl || q,
                duration: info.duration,
                thumbnail: info.thumbnail,
                uploader: info.uploader
              }
            ],
            `Added “${info.title}”`
          )
        }
        setQuery('')
      } else {
        const found = await window.api.extract.search(q)
        setResults(found)
        setOpen(found.length > 0)
        if (found.length === 0) setError('No results for that search.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  function addResult(entry: PlaylistEntry): void {
    void enqueue(
      [
        {
          title: entry.title,
          url: entry.url,
          duration: entry.duration,
          thumbnail: entry.thumbnail,
          uploader: entry.uploader
        }
      ],
      `Added “${entry.title}”`
    )
  }

  return (
    <section ref={rootRef} className="relative z-20 shrink-0">
      <div className="flex items-end gap-3">
        <div className="line-field line-field-blue group flex-1 pb-3">
          <Search
            size={19}
            className="shrink-0 text-[var(--t-faint)] transition-colors group-focus-within:text-[var(--t-blue)]"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Search YouTube, or paste a link or playlist to queue it…"
            aria-label="Search or link to queue"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-base outline-none"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('')
                setResults([])
                setOpen(false)
              }}
              title="Clear"
              aria-label="Clear search"
              className="shrink-0 rounded-sm p-1 text-[var(--t-dim)] transition-colors hover:bg-[var(--t-hover)] hover:text-[var(--t-fg)]"
            >
              <X size={15} />
            </button>
          )}
        </div>
        <button
          onClick={() => void submit()}
          disabled={busy || !trimmed}
          className="key key-blue h-11 shrink-0 px-5 text-sm"
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : action === 'Search' ? (
            <Search size={16} />
          ) : null}
          {action}
        </button>
        <LocalFilesPanel />
      </div>

      {(notice || error) && !open && (
        <p
          role={error ? 'alert' : 'status'}
          className={`absolute left-0 top-full mt-2 flex items-center gap-1.5 text-[13px] ${
            notice ? 'text-[var(--t-fg)]' : 'text-[var(--t-red)]'
          }`}
        >
          {notice && <CheckCircle2 size={14} className="shrink-0 text-[var(--w-live)]" />}
          {notice ?? error}
        </p>
      )}

      {open && results.length > 0 && (
        <div className="sheet absolute left-0 right-0 top-full z-30 mt-3 flex max-h-[440px] flex-col rounded-sm shadow-[0_24px_48px_-12px_rgba(0,0,0,0.6)]">
          <div className="flex shrink-0 items-center gap-4 border-b border-[var(--t-rule-strong)] px-5 py-3">
            <span className="text-sm font-semibold">{results.length} results</span>
            {notice && (
              <span className="flex min-w-0 items-center gap-1.5 truncate text-[13px] text-[var(--t-dim)]">
                <CheckCircle2 size={13} className="shrink-0 text-[var(--w-live)]" />
                {notice}
              </span>
            )}
            <div className="ml-auto flex items-center gap-3">
              <button
                onClick={() =>
                  void enqueue(
                    results
                      .filter((e) => e.url)
                      .map((e) => ({
                        title: e.title,
                        url: e.url,
                        duration: e.duration,
                        thumbnail: e.thumbnail,
                        uploader: e.uploader
                      })),
                    `Added ${results.length} tracks`
                  )
                }
                className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--t-blue)] transition-opacity hover:opacity-80"
              >
                <ListPlus size={14} />
                Add all
              </button>
              <button
                onClick={() => setOpen(false)}
                title="Close results"
                aria-label="Close results"
                className="rounded-sm p-1 text-[var(--t-dim)] transition-colors hover:bg-[var(--t-hover)] hover:text-[var(--t-fg)]"
              >
                <X size={15} />
              </button>
            </div>
          </div>
          <ul className="scroll-ink min-h-0 flex-1 overflow-y-auto">
            {results.map((entry) => (
              <li key={entry.id}>
                <button
                  onClick={() => addResult(entry)}
                  title="Add to the queue"
                  className="group flex w-full items-center gap-4 border-b border-[var(--t-rule)] py-2.5 pl-5 pr-2.5 text-left transition-colors hover:bg-[var(--t-hover)]"
                >
                  <span className="relative shrink-0 overflow-hidden rounded-sm">
                    {entry.thumbnail ? (
                      <img
                        src={entry.thumbnail}
                        alt=""
                        loading="lazy"
                        className="aspect-video w-24 object-cover"
                      />
                    ) : (
                      <span className="flex aspect-video w-24 items-center justify-center bg-[var(--t-rule)]">
                        <Play size={15} className="text-[var(--t-faint)]" />
                      </span>
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-[var(--w-blue)]/80 opacity-0 transition-opacity group-hover:opacity-100">
                      <Plus size={18} className="text-white" />
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {entry.title}
                    </span>
                    {entry.uploader && (
                      <span className="mt-0.5 block truncate text-xs text-[var(--t-dim)]">
                        {entry.uploader}
                      </span>
                    )}
                  </span>
                  {entry.duration ? (
                    <span className="shrink-0 text-[13px] tabular-nums text-[var(--t-dim)]">
                      {formatDuration(entry.duration)}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
