import { useState } from 'react'
import { Search, Loader2, X, Play, Video, ListVideo } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import {
  looksLikeUrl,
  formatDuration,
  looksLikeAuthError,
  playlistChoiceId,
  youtubeEmbedUrl
} from '../../lib/format'

export function UrlBar(): React.JSX.Element {
  const [url, setUrl] = useState('')
  const [searching, setSearching] = useState(false)
  // When a pasted watch link also carries a playlist, hold it here so the user
  // can choose between the single video and the whole playlist before we probe.
  const [choice, setChoice] = useState<{ url: string; listId: string } | null>(null)
  const resolving = useAppStore((s) => s.resolving)
  const setResolving = useAppStore((s) => s.setResolving)
  const setInfo = useAppStore((s) => s.setInfo)
  const setError = useAppStore((s) => s.setError)
  const setCookieHint = useAppStore((s) => s.setCookieHint)
  const cookiesEnabled = useAppStore((s) => Boolean(s.config?.cookiesFromBrowser))
  const results = useAppStore((s) => s.searchResults)
  const setResults = useAppStore((s) => s.setSearchResults)

  function reportError(err: unknown, fallback: string): void {
    const message = err instanceof Error ? err.message : fallback
    setError(message)
    // Auth-gated content with cookies off: nudge the user to set them up.
    if (!cookiesEnabled && looksLikeAuthError(message)) setCookieHint(true)
  }

  async function resolveUrl(target: string, forcePlaylist = false): Promise<void> {
    setResolving(true)
    setError(null)
    setCookieHint(false)
    setInfo(null)
    setResults([])
    try {
      const info = await window.api.extract.info(target, forcePlaylist)
      setInfo(info)
    } catch (err) {
      reportError(err, 'Failed to resolve URL')
    } finally {
      setResolving(false)
    }
  }

  async function runSearch(query: string): Promise<void> {
    setSearching(true)
    setError(null)
    setCookieHint(false)
    setInfo(null)
    setResults([])
    try {
      setResults(await window.api.extract.search(query))
    } catch (err) {
      reportError(err, 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  function submit(): void {
    const trimmed = url.trim()
    if (!trimmed) return
    if (looksLikeUrl(trimmed)) {
      // A watch link that also carries a playlist is ambiguous - ask which one
      // the user wants instead of silently grabbing only the single video.
      const listId = playlistChoiceId(trimmed)
      if (listId) {
        setError(null)
        setCookieHint(false)
        setInfo(null)
        setResults([])
        setChoice({ url: trimmed, listId })
        return
      }
      void resolveUrl(trimmed)
    } else void runSearch(trimmed)
  }

  function chooseSingle(): void {
    if (!choice) return
    const target = choice.url
    setChoice(null)
    void resolveUrl(target)
  }

  function choosePlaylist(): void {
    if (!choice) return
    // Resolve the original watch URL in playlist mode rather than a bare
    // playlist?list=... URL: that works for both real playlists and Mix/radio
    // lists, which YouTube refuses to serve from a standalone playlist URL.
    const target = choice.url
    setChoice(null)
    void resolveUrl(target, true)
  }

  const busy = resolving || searching
  const trimmed = url.trim()
  const isUrl = looksLikeUrl(trimmed)
  const action = trimmed && !isUrl ? 'Search' : 'Resolve'

  function previewResult(entry: (typeof results)[number]): void {
    const embedUrl = youtubeEmbedUrl(entry.url, entry.id)
    if (embedUrl) {
      useAppStore
        .getState()
        .setPreview({ embedUrl, watchUrl: entry.url, title: entry.title })
    }
  }

  return (
    <div className={`flex flex-col gap-5 ${results.length > 0 ? 'min-h-0 flex-1' : ''}`}>
      <div className="flex items-end gap-4">
        <div className="line-field line-field-red group flex-1 pb-3">
          <Search
            size={20}
            className="shrink-0 text-[var(--t-faint)] transition-colors group-focus-within:text-[var(--t-red)]"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Paste a video or playlist link, or type to search YouTube…"
            aria-label="Video link or search"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-base outline-none"
          />
          {url && (
            <button
              onClick={() => {
                setUrl('')
                setResults([])
                setChoice(null)
              }}
              title="Clear"
              aria-label="Clear"
              className="shrink-0 rounded-sm p-1 text-[var(--t-dim)] transition-colors hover:bg-[var(--t-hover)] hover:text-[var(--t-fg)]"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <button
          onClick={submit}
          disabled={busy || !trimmed}
          className="key key-red h-12 shrink-0 px-6 text-sm"
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : action === 'Search' ? (
            <Search size={16} />
          ) : null}
          {action}
        </button>
      </div>

      {choice && (
        <div className="anim-toast-in flex flex-wrap items-center gap-x-5 gap-y-3 border-y border-[var(--t-rule)] py-4">
          <ListVideo size={20} className="shrink-0 text-[var(--t-red)]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">This link is part of a playlist</p>
            <p className="mt-0.5 text-sm text-[var(--t-dim)]">
              Download just this video, or the entire playlist it belongs to?
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={chooseSingle} className="key key-line h-10 px-4 text-sm">
              <Video size={15} />
              Just this video
            </button>
            <button onClick={choosePlaylist} className="key key-red h-10 px-4 text-sm">
              <ListVideo size={15} />
              Entire playlist
            </button>
          </div>
          <button
            onClick={() => setChoice(null)}
            title="Cancel"
            aria-label="Cancel"
            className="shrink-0 rounded-sm p-1 text-[var(--t-dim)] transition-colors hover:bg-[var(--t-hover)] hover:text-[var(--t-fg)]"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {results.length > 0 && (
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-baseline justify-between border-b border-[var(--t-rule-strong)] pb-3">
            <span className="text-sm font-semibold">{results.length} search results</span>
            <button
              onClick={() => setResults([])}
              className="text-sm text-[var(--t-dim)] transition-colors hover:text-[var(--t-fg)]"
            >
              Clear
            </button>
          </div>
          <ul className="scroll-ink -ml-3 -mr-[22px] min-h-0 flex-1 overflow-y-auto">
            {results.map((entry) => (
              <li
                key={entry.id}
                className="group relative flex items-center gap-4 border-b border-[var(--t-rule)] px-3 py-3 transition-colors hover:bg-[var(--t-hover)]"
              >
                <button
                  onClick={() => previewResult(entry)}
                  title="Preview this video"
                  aria-label={`Preview ${entry.title}`}
                  className="group/thumb relative z-10 shrink-0 overflow-hidden rounded-sm"
                >
                  {entry.thumbnail ? (
                    <img
                      src={entry.thumbnail}
                      alt=""
                      loading="lazy"
                      className="aspect-video w-28 object-cover"
                    />
                  ) : (
                    <span className="flex aspect-video w-28 items-center justify-center bg-[var(--t-rule)]">
                      <Play size={16} className="text-[var(--t-faint)]" />
                    </span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover/thumb:opacity-100">
                    <Play size={18} className="text-white" fill="currentColor" />
                  </span>
                </button>
                <button
                  onClick={() => void resolveUrl(entry.url)}
                  className="flex min-w-0 flex-1 items-center gap-4 text-left after:absolute after:inset-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">
                      {entry.title}
                    </span>
                    {entry.uploader && (
                      <span className="mt-0.5 block truncate text-[13px] text-[var(--t-dim)]">
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
        </section>
      )}
    </div>
  )
}
