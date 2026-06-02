import { useEffect, useMemo, useRef, useState } from 'react'
import { Music, Video, Download, SlidersHorizontal, Volume2, ListVideo, Clock, X, Loader2, Plus } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import type {
  AudioFormat,
  DownloadKind,
  PlaylistEntry,
  VideoContainer,
  VideoFormat
} from '@shared/types'
import { PRESETS, getPreset } from '@shared/presets'
import { formatBytes, formatDuration } from '../../lib/format'
import { Select, type SelectOption } from '../shared/Select'

const AUDIO_FORMATS: AudioFormat[] = ['mp3', 'm4a', 'opus', 'flac', 'wav']
const VIDEO_CONTAINERS: VideoContainer[] = ['mp4', 'mkv']
const AUDIO_BITRATES = [320, 256, 192, 128, 96]

function formatHeight(format: VideoFormat): number {
  const res = format.resolution ?? ''
  const fromX = res.includes('x') ? Number(res.split('x')[1]) : Number(res.replace(/\D/g, ''))
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
  const [embedThumbnail, setEmbedThumbnail] = useState<boolean>(
    config?.embedThumbnail ?? true
  )
  const [embedMetadata, setEmbedMetadata] = useState<boolean>(config?.embedMetadata ?? true)
  const [embedChapters, setEmbedChapters] = useState<boolean>(config?.embedChapters ?? true)
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
    const end = info.playlistCount > 0 ? Math.min(info.playlistCount, start + limit - 1) : start + limit - 1
    setLoadingMore(true)
    try {
      const page = await window.api.extract.playlistPage(info.webpageUrl, start, end)
      appendEntries(page)
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

  async function startDownload(): Promise<void> {
    if (!info) return
    const total = info.entries.length
    // Only send an explicit item list when it's a real subset; an empty list
    // (or "all selected") downloads the whole playlist.
    const playlistItems =
      info.isPlaylist && selectedItems.size > 0 && selectedItems.size < total
        ? [...selectedItems].sort((a, b) => a - b).join(',')
        : undefined
    await window.api.download.start({
      url: info.webpageUrl,
      kind,
      title: info.title,
      formatId: kind === 'video' ? formatId || undefined : undefined,
      container: kind === 'video' ? container : undefined,
      audioFormat: kind === 'audio' ? audioFormat : undefined,
      audioBitrate: kind === 'audio' ? audioBitrate : undefined,
      // A single-video URL must never expand into a playlist it happens to
      // belong to; playlists download normally (optionally filtered above).
      noPlaylist: !info.isPlaylist,
      playlistItems,
      embedThumbnail,
      embedMetadata,
      embedChapters: kind === 'video' ? embedChapters : undefined,
      writeSubtitles,
      sponsorBlock
    })
  }

  return (
    <div
      className={`flex min-h-0 flex-col rounded-2xl border border-white/5 bg-white/[0.02] p-5 ${
        info.isPlaylist ? 'flex-1' : ''
      }`}
    >
      <div className="flex gap-4">
        {info.thumbnail && (
          <div className="relative shrink-0 overflow-hidden rounded-xl ring-1 ring-white/10">
            <img
              src={info.thumbnail}
              alt=""
              className="h-24 w-40 object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/60 to-transparent" />
            <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm">
              {info.isPlaylist ? (
                <>
                  <ListVideo size={11} />
                  {info.playlistCount} videos
                </>
              ) : (
                <>
                  <Clock size={11} />
                  {formatDuration(info.duration)}
                </>
              )}
            </span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                info.isPlaylist
                  ? 'bg-red-500/15 text-red-300'
                  : 'bg-emerald-500/15 text-emerald-300'
              }`}
            >
              {info.isPlaylist ? <ListVideo size={11} /> : <Video size={11} />}
              {info.isPlaylist ? 'Playlist' : 'Video'}
            </span>
            <button
              onClick={() => setInfo(null)}
              title="Close"
              className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
            >
              <X size={16} />
            </button>
          </div>
          <h3 className="selectable mt-2 line-clamp-2 text-base font-semibold leading-snug">
            {info.title}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/45">
            <span className="selectable truncate">{info.uploader ?? 'Unknown channel'}</span>
            {info.isPlaylist && (
              <span className="flex items-center gap-1">
                <Clock size={11} />
                {formatDuration(info.duration)} total
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => applyPreset(p.id)}
            className={`rounded-full border px-3 py-1 text-xs ${
              presetId === p.id
                ? 'border-red-500/50 bg-red-500/10 text-red-300'
                : 'border-white/10 text-white/50 hover:border-white/20'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <KindTab
          active={kind === 'video'}
          onClick={() => setKind('video')}
          icon={<Video size={15} />}
          label="Video"
          sublabel="with audio"
        />
        <KindTab
          active={kind === 'audio'}
          onClick={() => setKind('audio')}
          icon={<Music size={15} />}
          label="Audio"
          sublabel="audio only"
        />
      </div>

      <div className="mt-3">
        {kind === 'video' ? (
          <div className="space-y-2">
            <Select value={formatId} onChange={setFormatId} options={formatOptions} />
            <p className="flex items-center gap-1.5 text-xs text-white/40">
              <Volume2 size={12} className="shrink-0 text-emerald-400/70" />
              Best available audio is automatically merged into the video.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40">Container</span>
              {VIDEO_CONTAINERS.map((c) => (
                <button
                  key={c}
                  onClick={() => setContainer(c)}
                  className={`rounded-lg border px-3 py-1 text-xs uppercase ${
                    container === c
                      ? 'border-red-500/50 bg-red-500/10 text-red-300'
                      : 'border-white/10 text-white/60 hover:border-white/20'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {AUDIO_FORMATS.map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setAudioFormat(fmt)}
                  className={`rounded-lg border px-3 py-1.5 text-sm uppercase ${
                    audioFormat === fmt
                      ? 'border-red-500/50 bg-red-500/10 text-red-300'
                      : 'border-white/10 text-white/60 hover:border-white/20'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
            {audioFormat !== 'flac' && audioFormat !== 'wav' && (
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-xs text-white/40">Bitrate</span>
                <Select
                  value={String(audioBitrate)}
                  onChange={(v) => setAudioBitrate(Number(v))}
                  options={AUDIO_BITRATES.map((b) => ({
                    value: String(b),
                    label: `${b} kbps`
                  }))}
                  className="w-36"
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-3">
        <button
          onClick={() => setShowOptions((o) => !o)}
          className="flex items-center gap-1.5 text-xs text-white/45 hover:text-white/70"
        >
          <SlidersHorizontal size={13} />
          {showOptions ? 'Hide options' : 'More options'}
        </button>
        {showOptions && (
          <div className="mt-2 flex flex-wrap gap-1.5">
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

      {info.isPlaylist && (
        <PlaylistPicker
          entries={info.entries}
          total={info.playlistCount}
          selected={selectedItems}
          onToggle={toggleItem}
          onToggleAll={toggleAllItems}
          onLoadMore={loadMore}
          loadingMore={loadingMore}
        />
      )}

      <button
        onClick={startDownload}
        disabled={info.isPlaylist && selectedItems.size === 0}
        className="mt-4 flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-red-500 py-2.5 text-sm font-medium text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Download size={16} />
        {info.isPlaylist ? `Download ${selectedItems.size} item${selectedItems.size === 1 ? '' : 's'}` : 'Download'}
      </button>
    </div>
  )
}

function KindTab({
  active,
  onClick,
  icon,
  label,
  sublabel
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  sublabel?: string
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition ${
        active
          ? 'border-red-500/40 bg-red-500/15 text-red-300'
          : 'border-white/10 text-white/50 hover:border-white/20 hover:text-white'
      }`}
    >
      {icon}
      <span className="flex items-baseline gap-1.5">
        {label}
        {sublabel && (
          <span
            className={`text-[11px] font-normal ${active ? 'text-red-300/70' : 'text-white/30'}`}
          >
            {sublabel}
          </span>
        )}
      </span>
    </button>
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
      className={`rounded-full border px-3 py-1 text-xs transition ${
        active
          ? 'border-red-500/50 bg-red-500/10 text-red-300'
          : 'border-white/10 text-white/45 hover:border-white/20'
      }`}
    >
      {label}
    </button>
  )
}

function PlaylistPicker({
  entries,
  total,
  selected,
  onToggle,
  onToggleAll,
  onLoadMore,
  loadingMore
}: {
  entries: PlaylistEntry[]
  total: number
  selected: Set<number>
  onToggle: (index: number) => void
  onToggleAll: () => void
  onLoadMore: () => void
  loadingMore: boolean
}): React.JSX.Element {
  const allSelected = selected.size === entries.length
  // yt-dlp reports the full list size in `total`; when we've only fetched a
  // capped slice, offer to page in the rest.
  const remaining = total > entries.length ? total - entries.length : 0
  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10">
      <div className="flex shrink-0 items-center justify-between bg-white/[0.03] px-3 py-2">
        <span className="text-xs text-white/45">
          {selected.size} of {entries.length} selected
          {remaining > 0 && <span className="text-white/30"> · {total} total</span>}
        </span>
        <button
          onClick={onToggleAll}
          className="text-xs font-medium text-red-300 hover:text-red-200"
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>
      <ul className="scroll-thin min-h-0 flex-1 divide-y divide-white/5 overflow-y-auto">
        {entries.map((entry, i) => {
          const index = i + 1
          const checked = selected.has(index)
          return (
            <li key={entry.id || index}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-white/[0.03]">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(index)}
                  className="h-4 w-4 shrink-0 accent-red-500"
                />
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-white/30">
                  {index}
                </span>
                {entry.thumbnail && (
                  <img
                    src={entry.thumbnail}
                    alt=""
                    className="h-8 w-14 shrink-0 rounded object-cover"
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-white/80">
                  {entry.title}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-white/35">
                  {formatDuration(entry.duration)}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      {remaining > 0 && (
        <button
          onClick={onLoadMore}
          disabled={loadingMore}
          className="flex shrink-0 items-center justify-center gap-1.5 border-t border-white/10 bg-white/[0.03] py-2 text-xs font-medium text-white/60 hover:bg-white/[0.06] hover:text-white/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loadingMore ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              Loading…
            </>
          ) : (
            <>
              <Plus size={13} />
              Load more ({remaining} remaining)
            </>
          )}
        </button>
      )}
    </div>
  )
}
