import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Music,
  Video,
  Download,
  Play,
  SlidersHorizontal,
  Volume2,
  ListVideo,
  Clock,
  X,
  Loader2,
  ChevronDown
} from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import type {
  AudioFormat,
  DownloadKind,
  MediaInfo,
  PlaylistEntry,
  VideoContainer,
  VideoFormat
} from '@shared/types'
import { PRESETS, getPreset } from '@shared/presets'
import { formatBytes, formatDuration, youtubeEmbedUrl } from '../../lib/format'
import { Select, type SelectOption } from '../shared/Select'
import { Segmented, type SegmentOption } from '../shared/Segmented'

/** Open the in-app preview modal for a video, when an embed can be derived. */
function openPreview(url: string, title: string, id?: string | null): void {
  const embedUrl = youtubeEmbedUrl(url, id)
  if (embedUrl) {
    useAppStore.getState().setPreview({ embedUrl, watchUrl: url, title })
  }
}

const AUDIO_FORMATS: AudioFormat[] = ['mp3', 'm4a', 'opus', 'flac', 'wav']
const VIDEO_CONTAINERS: VideoContainer[] = ['mp4', 'mkv']
const AUDIO_BITRATES = [320, 256, 192, 128, 96]

const KIND_OPTIONS: SegmentOption<DownloadKind>[] = [
  { value: 'video', label: 'Video', sublabel: 'with audio', icon: <Video size={15} /> },
  { value: 'audio', label: 'Audio', sublabel: 'audio only', icon: <Music size={15} /> }
]
const CONTAINER_OPTIONS: SegmentOption<VideoContainer>[] = VIDEO_CONTAINERS.map((c) => ({
  value: c,
  label: c
}))
const AUDIO_FORMAT_OPTIONS: SegmentOption<AudioFormat>[] = AUDIO_FORMATS.map((f) => ({
  value: f,
  label: f
}))

function formatHeight(format: VideoFormat): number {
  const res = format.resolution ?? ''
  const fromX = res.includes('x')
    ? Number(res.split('x')[1])
    : Number(res.replace(/\D/g, ''))
  return Number.isFinite(fromX) ? fromX : 0
}

export function MediaCard(): React.JSX.Element | null {
  const info = useAppStore((s) => s.info)
  const setInfo = useAppStore((s) => s.setInfo)
  const appendEntries = useAppStore((s) => s.appendEntries)
  const config = useAppStore((s) => s.config)
  const [kind, setKind] = useState<DownloadKind>('video')
  const [formatId, setFormatId] = useState<string>('')
  const [audioFormat, setAudioFormat] = useState<AudioFormat>('mp3')
  const [container, setContainer] = useState<VideoContainer>(
    config?.videoContainer ?? 'mp4'
  )
  const [presetId, setPresetId] = useState<string>(config?.defaultPreset ?? 'best-mp4')
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set())
  const [audioBitrate, setAudioBitrate] = useState<number>(320)
  const [showOptions, setShowOptions] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // Set once a "load more" page comes back short, so we stop offering to page
  // further on lists whose total size yt-dlp never reports (e.g. YouTube Mixes).
  const [reachedEnd, setReachedEnd] = useState(false)
  const [embedThumbnail, setEmbedThumbnail] = useState<boolean>(
    config?.embedThumbnail ?? true
  )
  const [embedMetadata, setEmbedMetadata] = useState<boolean>(
    config?.embedMetadata ?? true
  )
  const [embedChapters, setEmbedChapters] = useState<boolean>(
    config?.embedChapters ?? true
  )
  const [writeSubtitles, setWriteSubtitles] = useState<boolean>(
    config?.writeSubtitles ?? false
  )
  const [sponsorBlock, setSponsorBlock] = useState<boolean>(config?.sponsorBlock ?? false)

  const videoFormats = useMemo<VideoFormat[]>(() => {
    if (!info) return []
    return info.formats
      .filter((f) => f.vcodec && f.resolution)
      .sort((a, b) => (b.tbr ?? 0) - (a.tbr ?? 0))
  }, [info])

  // Start with every playlist item selected whenever a *new* playlist resolves.
  // Keyed on the playlist id so that loading more pages (which grows
  // `info.entries`) preserves any items the user has deselected.
  const lastPlaylistId = useRef<string | null>(null)
  useEffect(() => {
    if (!info?.isPlaylist) {
      lastPlaylistId.current = null
      setSelectedItems(new Set())
      return
    }
    if (lastPlaylistId.current !== info.id) {
      lastPlaylistId.current = info.id
      setSelectedItems(new Set(info.entries.map((_, i) => i + 1)))
      setReachedEnd(false)
    }
  }, [info])

  const formatOptions = useMemo<SelectOption[]>(() => {
    const opts: SelectOption[] = [
      { value: '', label: 'Best quality (auto)', hint: 'video + best audio' }
    ]
    for (const f of videoFormats) {
      opts.push({
        value: f.formatId,
        label: `${f.resolution}${f.fps ? `@${f.fps}` : ''}`,
        hint: `${f.ext} · ${formatBytes(f.filesize)} · + audio`
      })
    }
    return opts
  }, [videoFormats])

  function applyPreset(id: string): void {
    setPresetId(id)
    const preset = getPreset(id)
    if (!preset) return
    setKind(preset.kind)
    if (preset.kind === 'audio' && preset.audioFormat) {
      setAudioFormat(preset.audioFormat)
      return
    }
    if (preset.container) setContainer(preset.container)
    if (preset.maxHeight == null) {
      setFormatId('')
    } else {
      const match = videoFormats.find((f) => formatHeight(f) <= preset.maxHeight!)
      setFormatId(match?.formatId ?? '')
    }
  }

  if (!info) return null

  function toggleItem(index: number): void {
    setSelectedItems((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function toggleAllItems(): void {
    if (!info) return
    setSelectedItems((prev) =>
      prev.size === info.entries.length
        ? new Set()
        : new Set(info.entries.map((_, i) => i + 1))
    )
  }

  async function loadMore(): Promise<void> {
    if (!info || loadingMore) return
    const start = info.entries.length + 1
    const limit = config?.playlistFetchLimit || 200
    // When the true total is known (real playlists), don't fetch past it. Mixes
    // report no total, so just request a full page beyond what we already have.
    const end =
      info.playlistCount > info.entries.length
        ? Math.min(info.playlistCount, start + limit - 1)
        : start + limit - 1
    setLoadingMore(true)
    try {
      const page = await window.api.extract.playlistPage(info.webpageUrl, start, end)
      appendEntries(page)
      // A short (or empty) page means we've reached the end of a list whose
      // size yt-dlp never reported (e.g. a Mix) - stop offering "load more".
      if (page.length < limit) setReachedEnd(true)
      // Newly loaded items default to selected, matching the initial behavior.
      setSelectedItems((prev) => {
        const next = new Set(prev)
        for (let i = 0; i < page.length; i++) next.add(start + i)
        return next
      })
    } catch (err) {
      // Surface the failure but keep the already-loaded items intact.
      useAppStore
        .getState()
        .setError(err instanceof Error ? err.message : 'Failed to load more items')
    } finally {
      setLoadingMore(false)
    }
  }

  /** Wraps a setter so a manual change that departs from the preset clears its highlight. */
  function manual<T>(current: T, set: (value: T) => void): (value: T) => void {
    return (value) => {
      if (value === current) return
      set(value)
      setPresetId('')
    }
  }

  async function startDownload(): Promise<void> {
    if (!info) return
    const sharedOpts = {
      kind,
      formatId: kind === 'video' ? formatId || undefined : undefined,
      container: kind === 'video' ? container : undefined,
      audioFormat: kind === 'audio' ? audioFormat : undefined,
      audioBitrate: kind === 'audio' ? audioBitrate : undefined,
      embedThumbnail,
      embedMetadata,
      embedChapters: kind === 'video' ? embedChapters : undefined,
      writeSubtitles,
      sponsorBlock
    }
    if (info.isPlaylist) {
      // Enqueue each selected item as an independent job so the download
      // manager runs them in parallel up to maxConcurrentDownloads.
      const indices = [...selectedItems].sort((a, b) => a - b)
      for (const index of indices) {
        const entry = info.entries[index - 1]
        if (!entry) continue
        await window.api.download.start({
          url: entry.url,
          title: entry.title,
          noPlaylist: true,
          ...sharedOpts
        })
      }
    } else {
      await window.api.download.start({
        url: info.webpageUrl,
        title: info.title,
        // Prevent a watch URL that belongs to a playlist from expanding.
        noPlaylist: true,
        ...sharedOpts
      })
    }
  }

  const controls = (
    <>
      <div role="group" aria-label="Preset" className="tape grid grid-cols-3 gap-1 p-1">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => applyPreset(p.id)}
            aria-pressed={presetId === p.id}
            className="chip truncate px-2 py-1.5 text-[13px]"
          >
            {p.label}
          </button>
        ))}
      </div>

      <Segmented
        label="Output"
        value={kind}
        options={KIND_OPTIONS}
        onChange={manual(kind, setKind)}
      />

      {kind === 'video' ? (
        <div className="flex flex-col gap-2.5">
          <Select
            value={formatId}
            onChange={manual(formatId, setFormatId)}
            options={formatOptions}
          />
          <p className="flex items-center gap-1.5 text-[13px] text-[var(--t-dim)]">
            <Volume2 size={13} className="shrink-0" />
            Best available audio is automatically merged into the video.
          </p>
          <div className="mt-1 flex items-center gap-4">
            <span className="w-20 shrink-0 text-[13px] font-semibold text-[var(--t-dim)]">
              Container
            </span>
            <div className="w-44">
              <Segmented
                label="Container"
                value={container}
                options={CONTAINER_OPTIONS}
                onChange={manual(container, setContainer)}
                size="sm"
                uppercase
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Segmented
            label="Audio format"
            value={audioFormat}
            options={AUDIO_FORMAT_OPTIONS}
            onChange={manual(audioFormat, setAudioFormat)}
            size="sm"
            uppercase
          />
          {audioFormat !== 'flac' && audioFormat !== 'wav' && (
            <div className="flex items-center gap-4">
              <span className="w-20 shrink-0 text-[13px] font-semibold text-[var(--t-dim)]">
                Bitrate
              </span>
              <Select
                value={String(audioBitrate)}
                onChange={(v) => setAudioBitrate(Number(v))}
                options={AUDIO_BITRATES.map((b) => ({
                  value: String(b),
                  label: `${b} kbps`
                }))}
                className="w-44"
              />
            </div>
          )}
        </div>
      )}

      <div>
        <button
          onClick={() => setShowOptions((o) => !o)}
          aria-expanded={showOptions}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--t-dim)] transition-colors hover:text-[var(--t-fg)]"
        >
          <SlidersHorizontal size={14} />
          {showOptions ? 'Hide options' : 'More options'}
          <ChevronDown
            size={14}
            className={`transition-transform duration-200 ${showOptions ? 'rotate-180' : ''}`}
          />
        </button>
        {showOptions && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <OptionChip
              label="Thumbnail"
              active={embedThumbnail}
              onClick={() => setEmbedThumbnail((v) => !v)}
            />
            <OptionChip
              label="Metadata"
              active={embedMetadata}
              onClick={() => setEmbedMetadata((v) => !v)}
            />
            {kind === 'video' && (
              <OptionChip
                label="Chapters"
                active={embedChapters}
                onClick={() => setEmbedChapters((v) => !v)}
              />
            )}
            <OptionChip
              label="Subtitles"
              active={writeSubtitles}
              onClick={() => setWriteSubtitles((v) => !v)}
            />
            <OptionChip
              label="SponsorBlock"
              active={sponsorBlock}
              onClick={() => setSponsorBlock((v) => !v)}
            />
          </div>
        )}
      </div>
    </>
  )

  const downloadKey = (
    <button
      onClick={startDownload}
      disabled={info.isPlaylist && selectedItems.size === 0}
      className="key key-red h-12 w-full shrink-0 text-[15px]"
    >
      <Download size={17} />
      {info.isPlaylist
        ? `Download ${selectedItems.size} item${selectedItems.size === 1 ? '' : 's'}`
        : 'Download'}
    </button>
  )

  if (info.isPlaylist) {
    return (
      <section className="anim-toast-in flex min-h-0 flex-1 flex-col gap-5">
        <header className="flex shrink-0 items-start gap-6">
          <MediaThumbnail info={info} compact />
          <MediaHeading info={info} onClose={() => setInfo(null)} size="compact" />
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px] gap-10">
          <PlaylistPicker
            entries={info.entries}
            total={info.playlistCount}
            fetchLimit={config?.playlistFetchLimit ?? 200}
            reachedEnd={reachedEnd}
            selected={selectedItems}
            onToggle={toggleItem}
            onToggleAll={toggleAllItems}
            onLoadMore={loadMore}
            loadingMore={loadingMore}
          />
          <div aria-label="Download options" className="flex min-h-0 flex-col gap-4">
            <div className="scroll-ink -mr-[10px] flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
              {controls}
            </div>
            {downloadKey}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="anim-toast-in grid grid-cols-[minmax(0,1.05fr)_minmax(320px,1fr)] items-start gap-10">
      <MediaThumbnail info={info} />
      <div className="flex min-w-0 flex-col gap-4">
        <MediaHeading info={info} onClose={() => setInfo(null)} size="full" />
        <div aria-label="Download options" className="mt-1 flex flex-col gap-4">
          {controls}
          {downloadKey}
        </div>
      </div>
    </section>
  )
}

/**
 * The resolved media's artwork: full column width for a single video, with an
 * always-visible Preview affordance; a compact 16:9 tile for playlists.
 */
function MediaThumbnail({
  info,
  compact = false
}: {
  info: MediaInfo
  compact?: boolean
}): React.JSX.Element {
  const previewable =
    !info.isPlaylist && Boolean(youtubeEmbedUrl(info.webpageUrl, info.id))
  const frame = compact ? 'aspect-video w-44 2xl:w-56' : 'aspect-video w-full'
  const count = info.playlistCount > 0 ? info.playlistCount : info.entries.length

  if (!info.thumbnail) {
    return (
      <div
        className={`${frame} flex shrink-0 items-center justify-center rounded-sm bg-[var(--t-rule)] text-[var(--t-faint)]`}
      >
        {info.isPlaylist ? <ListVideo size={compact ? 22 : 36} /> : <Video size={36} />}
      </div>
    )
  }

  return (
    <button
      onClick={() => previewable && openPreview(info.webpageUrl, info.title, info.id)}
      disabled={!previewable}
      title={previewable ? 'Preview this video' : undefined}
      aria-label={previewable ? 'Preview this video' : undefined}
      className={`${frame} group/thumb relative block shrink-0 overflow-hidden rounded-sm disabled:cursor-default`}
    >
      <img
        src={info.thumbnail}
        alt=""
        className={`h-full w-full object-cover transition-transform duration-500 ease-out ${
          previewable ? 'group-hover/thumb:scale-[1.03]' : ''
        }`}
      />
      <span className="absolute bottom-2.5 left-2.5 flex items-center gap-1 rounded-sm bg-black/70 px-1.5 py-1 text-xs font-semibold tabular-nums text-white/90">
        {info.isPlaylist ? (
          <>
            <ListVideo size={12} />
            {count} videos
          </>
        ) : (
          <>
            <Clock size={12} />
            {formatDuration(info.duration)}
          </>
        )}
      </span>
      {previewable && (
        <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 rounded-sm bg-black/70 px-2.5 py-1 text-xs font-semibold text-white/90 transition-colors duration-150 group-hover/thumb:bg-[var(--w-red)] group-hover/thumb:text-white">
          <Play size={12} fill="currentColor" />
          Preview
        </span>
      )}
    </button>
  )
}

/** Display-size title with the kind and channel line, plus the close action. */
function MediaHeading({
  info,
  onClose,
  size
}: {
  info: MediaInfo
  onClose: () => void
  size: 'full' | 'compact'
}): React.JSX.Element {
  const playlistDuration = info.isPlaylist && info.duration != null && info.duration > 0
  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <div className="min-w-0 flex-1">
        <h2
          className={`display selectable ${
            size === 'full'
              ? 'line-clamp-2 text-[22px] 2xl:line-clamp-3 2xl:text-[26px]'
              : 'line-clamp-2 text-[20px] 2xl:text-[22px]'
          }`}
          title={info.title}
        >
          {info.title}
        </h2>
        <p className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--t-dim)]">
          <span className="flex shrink-0 items-center gap-1.5 font-semibold text-[var(--t-fg)]">
            {info.isPlaylist ? <ListVideo size={14} /> : <Video size={14} />}
            {info.isPlaylist ? 'Playlist' : 'Video'}
          </span>
          <span aria-hidden="true">·</span>
          <span className="selectable min-w-0 truncate">
            {info.uploader ?? 'Unknown channel'}
          </span>
          {playlistDuration && (
            <>
              <span aria-hidden="true">·</span>
              <span className="shrink-0 tabular-nums">
                {formatDuration(info.duration)} total
              </span>
            </>
          )}
        </p>
      </div>
      <button
        onClick={onClose}
        title="Close"
        aria-label="Close"
        className="-mr-1 shrink-0 rounded-sm p-1.5 text-[var(--t-dim)] transition-colors hover:bg-[var(--t-hover)] hover:text-[var(--t-fg)]"
      >
        <X size={18} />
      </button>
    </div>
  )
}

function OptionChip({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="chip px-3 py-1.5 text-[13px]"
    >
      {label}
    </button>
  )
}

function PlaylistPicker({
  entries,
  total,
  fetchLimit,
  reachedEnd,
  selected,
  onToggle,
  onToggleAll,
  onLoadMore,
  loadingMore
}: {
  entries: PlaylistEntry[]
  total: number
  fetchLimit: number
  reachedEnd: boolean
  selected: Set<number>
  onToggle: (index: number) => void
  onToggleAll: () => void
  onLoadMore: () => void
  loadingMore: boolean
}): React.JSX.Element {
  const allSelected = selected.size === entries.length
  // The real playlist size, when yt-dlp reports one larger than what we've
  // fetched. Mixes/radios report no usable total (it gets backfilled to the
  // fetched count), so this is 0 for them.
  const remaining = total > entries.length ? total - entries.length : 0
  // Offer to page in more whenever the last fetch filled a complete page and we
  // haven't yet hit a short page. This is the only reliable signal for Mixes,
  // which never advertise a total. Disabled when the fetch cap is 0 (unlimited,
  // so everything is already loaded).
  const canLoadMore = fetchLimit > 0 && !reachedEnd && entries.length >= fetchLimit
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 items-baseline justify-between border-b border-[var(--t-rule-strong)] pb-3">
        <span className="text-sm tabular-nums text-[var(--t-dim)]">
          {selected.size} of {entries.length} selected
          {remaining > 0 && <span> · {total} total</span>}
          {remaining <= 0 && canLoadMore && <span> · more available</span>}
        </span>
        <button
          onClick={onToggleAll}
          className="text-sm font-semibold text-[var(--t-red)] transition-opacity hover:opacity-80"
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>
      <ul className="scroll-ink -mr-[10px] min-h-0 flex-1 overflow-y-auto">
        {entries.map((entry, i) => {
          const index = i + 1
          const checked = selected.has(index)
          return (
            <li key={entry.id || index}>
              <label className="flex cursor-pointer items-center gap-4 border-b border-[var(--t-rule)] py-2.5 pr-1 transition-colors hover:bg-[var(--t-hover)]">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(index)}
                  className="tick ml-1 shrink-0"
                />
                <span
                  className={`numeral w-7 shrink-0 text-right text-sm transition-colors ${
                    checked ? 'text-[var(--t-fg)]' : 'text-[var(--t-faint)]'
                  }`}
                >
                  {index}
                </span>
                {entry.thumbnail && (
                  <button
                    onClick={(e) => {
                      // Inside the checkbox label: keep the click from toggling
                      // the item's selection when the intent is to preview.
                      e.preventDefault()
                      e.stopPropagation()
                      openPreview(entry.url, entry.title, entry.id)
                    }}
                    title="Preview this video"
                    aria-label={`Preview ${entry.title}`}
                    className={`group/thumb relative shrink-0 overflow-hidden rounded-sm transition-opacity ${
                      checked ? '' : 'opacity-45'
                    }`}
                  >
                    <img
                      src={entry.thumbnail}
                      alt=""
                      loading="lazy"
                      className="aspect-video w-24 object-cover"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover/thumb:opacity-100">
                      <Play size={14} className="text-white" fill="currentColor" />
                    </span>
                  </button>
                )}
                <span
                  className={`min-w-0 flex-1 truncate text-sm transition-colors ${
                    checked ? 'text-[var(--t-fg)]' : 'text-[var(--t-faint)]'
                  }`}
                >
                  {entry.title}
                </span>
                <span className="shrink-0 text-[13px] tabular-nums text-[var(--t-dim)]">
                  {formatDuration(entry.duration)}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      {canLoadMore && (
        <button
          onClick={onLoadMore}
          disabled={loadingMore}
          className="group flex shrink-0 items-center justify-center gap-2 border-b border-[var(--t-rule)] py-3 text-sm font-semibold text-[var(--t-red)] transition-colors hover:bg-[var(--t-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loadingMore ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Loading more…
            </>
          ) : (
            <>
              <ChevronDown
                size={16}
                className="transition-transform group-hover:translate-y-0.5"
              />
              Load {remaining > 0 ? Math.min(remaining, fetchLimit) : fetchLimit} more
              {remaining > 0 && (
                <span className="font-normal text-[var(--t-dim)]">
                  · {remaining} remaining
                </span>
              )}
            </>
          )}
        </button>
      )}
    </div>
  )
}
