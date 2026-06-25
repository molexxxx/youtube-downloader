import { useState } from 'react'
import { ListPlus, Loader2, Play, Plus, Search } from 'lucide-react'
import type { PlaylistEntry, TrackInput } from '@shared/types'
import { useAppStore } from '../../stores/appStore'
import { formatDuration, looksLikeUrl } from '../../lib/format'

/** Search YouTube or paste a link/playlist, then add tracks to the active queue. */
export function SearchPanel(): React.JSX.Element | null {
  const guildId = useAppStore((s) => s.activeGuildId)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<PlaylistEntry[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!guildId) return null

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
    setResults([])
    try {
      if (looksLikeUrl(q)) {
        const info = await window.api.extract.info(q)
        if (info.isPlaylist) {
          const inputs = info.entries
            .filter((e) => e.url)
            .map((e) => ({
              title: e.title,
              url: e.url,
              duration: e.duration,
              thumbnail: e.thumbnail
            }))
          await enqueue(inputs, `Added ${inputs.length} tracks from playlist`)
        } else {
          await enqueue(
            [
              {
                title: info.title,
                url: info.webpageUrl || q,
                duration: info.duration,
                thumbnail: info.thumbnail
              }
            ],
            `Added “${info.title}”`
          )
        }
        setQuery('')
      } else {
        setResults(await window.api.extract.search(q))
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
          thumbnail: entry.thumbnail
        }
      ],
      `Added “${entry.title}”`
    )
  }

  return (
    <section className="flex shrink-0 flex-col gap-2.5">
      <div className="flex gap-2.5">
        <div className="group flex flex-1 items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 focus-within:border-indigo-500/60">
          <Search size={17} className="shrink-0 text-white/40 group-focus-within:text-indigo-400/80" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            placeholder="Search YouTube, or paste a video/playlist link…"
            spellCheck={false}
            className="flex-1 bg-transparent text-sm text-white/90 outline-none placeholder:text-white/30"
          />
        </div>
        <button
          onClick={() => void submit()}
          disabled={busy || !query.trim()}
          className="flex items-center gap-2 rounded-xl bg-indigo-500 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Add
        </button>
      </div>

      {notice && (
        <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-1.5 text-xs text-emerald-300">
          {notice}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-1.5 text-xs text-red-300">
          {error}
        </p>
      )}

      {results.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
          <div className="flex items-center justify-between border-b border-white/5 px-3.5 py-2">
            <span className="text-xs font-medium text-white/45">{results.length} results</span>
            <button
              onClick={() =>
                void enqueue(
                  results
                    .filter((e) => e.url)
                    .map((e) => ({
                      title: e.title,
                      url: e.url,
                      duration: e.duration,
                      thumbnail: e.thumbnail
                    })),
                  `Added ${results.length} tracks`
                )
              }
              className="flex items-center gap-1.5 text-xs text-indigo-300 transition-colors hover:text-indigo-200"
            >
              <ListPlus size={13} />
              Add all
            </button>
          </div>
          <ul className="scroll-thin max-h-64 divide-y divide-white/5 overflow-y-auto">
            {results.map((entry) => (
              <li key={entry.id}>
                <button
                  onClick={() => addResult(entry)}
                  className="group flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-white/[0.04]"
                >
                  <div className="relative shrink-0 overflow-hidden rounded-md">
                    {entry.thumbnail ? (
                      <img src={entry.thumbnail} alt="" className="h-10 w-[68px] object-cover" />
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
