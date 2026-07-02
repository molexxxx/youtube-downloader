import { useEffect, useRef, useState } from 'react'
import { ListPlus, Loader2, Play, Plus, Search, X } from 'lucide-react'
import type { PlaylistEntry, TrackInput } from '@shared/types'
import { useAppStore } from '../../stores/appStore'
import { formatDuration, looksLikeUrl } from '../../lib/format'
import { LocalFilesPanel } from './LocalFilesPanel'

/**
 * Search YouTube or paste a link/playlist, then add tracks to the active queue.
 * Results float over the player/queue as a dismissable dropdown (Esc, the X,
 * or clicking anywhere else closes it) so the layout never squishes.
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
      <div className="flex gap-2.5">
        <div className="field field-indigo group flex flex-1 items-center gap-2.5 px-4 py-2.5">
          <Search
            size={17}
            className="shrink-0 text-white/40 group-focus-within:text-indigo-400/80"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Search YouTube, or paste a link or playlist to queue it…"
            spellCheck={false}
            className="flex-1 bg-transparent text-sm text-white/90 outline-none placeholder:text-white/30"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('')
                setResults([])
                setOpen(false)
              }}
              title="Clear"
              className="shrink-0 rounded-md p-0.5 text-white/30 transition-colors hover:bg-white/10 hover:text-white/70"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          onClick={() => void submit()}
          disabled={busy || !trimmed}
          className="btn btn-indigo px-4 text-sm"
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
          className={`absolute left-0 right-0 top-full z-30 mt-2 rounded-lg border px-3 py-1.5 text-xs ${
            notice
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/25 bg-red-500/10 text-red-300'
          }`}
        >
          {notice ?? error}
        </p>
      )}

      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 flex max-h-96 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#12151c]/95 shadow-2xl shadow-black/50 backdrop-blur-md">
          <div className="flex shrink-0 items-center gap-3 border-b border-white/5 px-3.5 py-2">
            <span className="text-xs font-medium text-white/45">
              {results.length} results
            </span>
            {notice && (
              <span className="truncate text-xs text-emerald-300">{notice}</span>
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
                className="flex items-center gap-1.5 text-xs text-indigo-300 transition-colors hover:text-indigo-200"
              >
                <ListPlus size={13} />
                Add all
              </button>
              <button
                onClick={() => setOpen(false)}
                title="Close results"
                aria-label="Close results"
                className="rounded p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          </div>
          <ul className="scroll-thin-indigo min-h-0 flex-1 divide-y divide-white/5 overflow-y-auto">
            {results.map((entry) => (
              <li key={entry.id}>
                <button
                  onClick={() => addResult(entry)}
                  className="group flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-white/[0.04]"
                >
                  <div className="relative shrink-0 overflow-hidden rounded-md">
                    {entry.thumbnail ? (
                      <img
                        src={entry.thumbnail}
                        alt=""
                        className="h-10 w-[68px] object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-[68px] items-center justify-center bg-white/5">
                        <Play size={15} className="text-white/30" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <Plus size={16} className="text-white" />
                    </div>
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm text-white/80 group-hover:text-white">
                    {entry.title}
                  </span>
                  {entry.duration ? (
                    <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-xs tabular-nums text-white/45">
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
