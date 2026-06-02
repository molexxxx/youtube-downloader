import { useState } from 'react'
import { Search, Loader2, X, Play } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { looksLikeUrl, formatDuration } from '../../lib/format'

export function UrlBar(): React.JSX.Element {
  const [url, setUrl] = useState('')
  const [searching, setSearching] = useState(false)
  const resolving = useAppStore((s) => s.resolving)
  const setResolving = useAppStore((s) => s.setResolving)
  const setInfo = useAppStore((s) => s.setInfo)
  const setError = useAppStore((s) => s.setError)
  const results = useAppStore((s) => s.searchResults)
  const setResults = useAppStore((s) => s.setSearchResults)

  async function resolveUrl(target: string): Promise<void> {
    setResolving(true)
    setError(null)
    setInfo(null)
    setResults([])
    try {
      const info = await window.api.extract.info(target)
      setInfo(info)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve URL')
    } finally {
      setResolving(false)
    }
  }

  async function runSearch(query: string): Promise<void> {
    setSearching(true)
    setError(null)
    setInfo(null)
    setResults([])
    try {
      setResults(await window.api.extract.search(query))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  function submit(): void {
    const trimmed = url.trim()
    if (!trimmed) return
    if (looksLikeUrl(trimmed)) void resolveUrl(trimmed)
    else void runSearch(trimmed)
  }

  const busy = resolving || searching
  const trimmed = url.trim()
  const isUrl = looksLikeUrl(trimmed)
  const action = trimmed && !isUrl ? 'Search' : 'Resolve'

  return (
    <div
      className={`flex flex-col space-y-2.5 ${
        results.length > 0 ? 'min-h-0 flex-1' : ''
      }`}
    >
      <div className="flex gap-2.5">
        <div className="group flex flex-1 items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 transition-colors focus-within:border-red-500/60 focus-within:bg-white/[0.05] focus-within:ring-1 focus-within:ring-red-500/20">
          <Search
            size={18}
            className="shrink-0 text-white/40 transition-colors group-focus-within:text-red-400/80"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Paste a URL, or type to search YouTube…"
            spellCheck={false}
            className="flex-1 bg-transparent text-sm text-white/90 outline-none placeholder:text-white/30"
          />
          {url && (
            <button
              onClick={() => {
                setUrl('')
                setResults([])
              }}
              title="Clear"
              className="shrink-0 rounded-md p-0.5 text-white/30 transition-colors hover:bg-white/10 hover:text-white/70"
            >
              <X size={15} />
            </button>
          )}
        </div>
        <button
          onClick={submit}
          disabled={busy || !trimmed}
          className="flex items-center gap-2 rounded-xl bg-red-500 px-5 text-sm font-medium text-white shadow-lg shadow-red-500/20 transition-all hover:bg-red-600 hover:shadow-red-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : action === 'Search' ? (
            <Search size={16} />
          ) : null}
          {action}
        </button>
      </div>

      {results.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
          <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-3.5 py-2">
            <span className="text-xs font-medium text-white/45">
              {results.length} search results
            </span>
            <button
              onClick={() => setResults([])}
              className="text-xs text-white/40 transition-colors hover:text-white/70"
            >
              Clear
            </button>
          </div>
          <ul className="scroll-thin min-h-0 flex-1 divide-y divide-white/5 overflow-y-auto">
            {results.map((entry) => (
              <li key={entry.id}>
                <button
                  onClick={() => void resolveUrl(entry.url)}
                  className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
                >
                  <div className="relative shrink-0 overflow-hidden rounded-md">
                    {entry.thumbnail ? (
                      <img
                        src={entry.thumbnail}
                        alt=""
                        className="h-11 w-[72px] object-cover"
                      />
                    ) : (
                      <div className="flex h-11 w-[72px] items-center justify-center bg-white/5">
                        <Play size={16} className="text-white/30" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <Play size={16} className="text-white" fill="currentColor" />
                    </div>
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm text-white/80 transition-colors group-hover:text-white">
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
    </div>
  )
}
