import { useEffect, useRef, useState } from 'react'
import {
  FolderOpen,
  HardDriveUpload,
  Headphones,
  ListPlus,
  Music,
  Pause,
  Play,
  Plus,
  X
} from 'lucide-react'
import type { LocalAudioFile, TrackInput } from '@shared/types'
import { useAppStore } from '../../stores/appStore'
import { formatBytes, formatClock, formatDuration } from '../../lib/format'

/** Track title for a file: the name without its extension. */
function titleOf(file: LocalAudioFile): string {
  return file.name.replace(/\.[^.]+$/, '')
}

function toTrackInput(file: LocalAudioFile, duration: number | null): TrackInput {
  return {
    title: titleOf(file),
    url: '',
    duration,
    thumbnail: null,
    uploader: null,
    filePath: file.path
  }
}

/**
 * Import local audio files (file picker or drag-and-drop) and queue them on
 * the bot - they play straight from disk. A dedicated preview bar at the
 * bottom plays files on this device only, clearly separated from the Queue
 * action so previewing is never mistaken for Discord playback. Renders as a
 * trigger button plus a dismissable dropdown anchored to the search row.
 */
export function LocalFilesPanel(): React.JSX.Element | null {
  const guildId = useAppStore((s) => s.activeGuildId)
  const files = useAppStore((s) => s.localFiles)
  const addLocalFiles = useAppStore((s) => s.addLocalFiles)
  const removeLocalFile = useAppStore((s) => s.removeLocalFile)
  const [open, setOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [durations, setDurations] = useState<Record<string, number>>({})
  const [playingPath, setPlayingPath] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [position, setPosition] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

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

  // Probe durations for newly imported files from their media metadata.
  useEffect(() => {
    const missing = files.filter((f) => durations[f.path] === undefined)
    if (missing.length === 0) return
    let cancelled = false
    const probes = missing.map((file) => {
      const probe = new Audio()
      probe.preload = 'metadata'
      probe.onloadedmetadata = () => {
        if (!cancelled && Number.isFinite(probe.duration)) {
          setDurations((d) => ({ ...d, [file.path]: probe.duration }))
        }
      }
      probe.src = file.mediaUrl
      return probe
    })
    return () => {
      cancelled = true
      for (const probe of probes) probe.src = ''
    }
  }, [files, durations])

  if (!guildId) return null

  const playingFile = files.find((f) => f.path === playingPath) ?? null
  const playingDuration = playingFile ? (durations[playingFile.path] ?? null) : null

  function flash(message: string): void {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 3000)
  }

  async function browse(): Promise<void> {
    const picked = await window.api.localMedia.pick()
    if (picked.length > 0) {
      addLocalFiles(picked)
      setOpen(true)
    }
  }

  async function importDropped(dropped: FileList): Promise<void> {
    const paths = [...dropped]
      .map((file) => window.api.localMedia.pathForFile(file))
      .filter(Boolean)
    const imported = await window.api.localMedia.register(paths)
    if (imported.length > 0) addLocalFiles(imported)
    else if (paths.length > 0) flash('No supported audio files in that drop.')
  }

  function togglePreview(file: LocalAudioFile): void {
    const audio = audioRef.current
    if (!audio) return
    if (playingPath === file.path) {
      if (audio.paused) {
        void audio.play()
        setPaused(false)
      } else {
        audio.pause()
        setPaused(true)
      }
      return
    }
    setPlayingPath(file.path)
    setPaused(false)
    setPosition(0)
    audio.src = file.mediaUrl
    void audio.play()
  }

  function seekPreview(seconds: number): void {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = seconds
    setPosition(seconds)
  }

  function stopPreview(): void {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
    }
    setPlayingPath(null)
    setPaused(false)
    setPosition(0)
  }

  async function enqueue(inputs: TrackInput[], label: string): Promise<void> {
    if (inputs.length === 0) return
    await window.api.discord.enqueue(guildId!, inputs)
    flash(label)
  }

  function remove(file: LocalAudioFile): void {
    if (playingPath === file.path) stopPreview()
    removeLocalFile(file.path)
  }

  return (
    <div ref={rootRef} className="contents">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Import local audio files"
        aria-label="Import local audio files"
        aria-expanded={open}
        className={`btn px-3.5 text-sm ${
          open
            ? 'border border-indigo-400/50 bg-indigo-500/15 text-indigo-200'
            : 'btn-ghost'
        }`}
      >
        <HardDriveUpload size={16} />
        Local
        {files.length > 0 && (
          <span className="rounded-full bg-indigo-500/25 px-1.5 text-[10px] font-semibold tabular-nums text-indigo-200">
            {files.length}
          </span>
        )}
      </button>

      {open && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            void importDropped(e.dataTransfer.files)
          }}
          className={`absolute left-0 right-0 top-full z-30 mt-2 flex max-h-96 flex-col overflow-hidden rounded-xl border bg-[#12151c]/95 shadow-2xl shadow-black/50 backdrop-blur-md transition-colors ${
            dragging ? 'border-indigo-400/60' : 'border-white/10'
          }`}
        >
          <div className="flex shrink-0 items-center gap-3 border-b border-white/5 px-3.5 py-2">
            <span className="text-xs font-medium text-white/45">
              {files.length === 0
                ? 'Local audio'
                : `${files.length} file${files.length === 1 ? '' : 's'}`}
            </span>
            {notice && (
              <span className="truncate text-xs text-emerald-300">{notice}</span>
            )}
            <div className="ml-auto flex items-center gap-3">
              <button
                onClick={() => void browse()}
                className="flex items-center gap-1.5 text-xs text-indigo-300 transition-colors hover:text-indigo-200"
              >
                <FolderOpen size={13} />
                Browse
              </button>
              {files.length > 1 && (
                <button
                  onClick={() =>
                    void enqueue(
                      files.map((f) => toTrackInput(f, durations[f.path] ?? null)),
                      `Added ${files.length} local tracks`
                    )
                  }
                  className="flex items-center gap-1.5 text-xs text-indigo-300 transition-colors hover:text-indigo-200"
                >
                  <ListPlus size={13} />
                  Queue all
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                title="Close"
                aria-label="Close local files"
                className="rounded p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {files.length === 0 ? (
            <button
              onClick={() => void browse()}
              className={`m-3 flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-8 text-sm transition-colors ${
                dragging
                  ? 'border-indigo-400/60 bg-indigo-500/10 text-indigo-200'
                  : 'border-white/15 text-white/40 hover:border-indigo-400/40 hover:text-white/70'
              }`}
            >
              <Music size={22} className={dragging ? 'text-indigo-300' : ''} />
              Drop audio files here, or click to browse
            </button>
          ) : (
            <ul className="scroll-thin-indigo min-h-0 flex-1 divide-y divide-white/5 overflow-y-auto">
              {files.map((file) => {
                const active = playingPath === file.path
                const duration = durations[file.path] ?? null
                return (
                  <li
                    key={file.path}
                    className={`flex items-center gap-2.5 px-3 py-2 ${
                      active ? 'bg-indigo-500/[0.06]' : ''
                    }`}
                  >
                    <button
                      onClick={() => togglePreview(file)}
                      title="Preview on this device (not in Discord)"
                      aria-label={
                        active && !paused ? `Pause ${file.name}` : `Preview ${file.name}`
                      }
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
                        active
                          ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25'
                          : 'bg-white/5 text-white/60 hover:bg-indigo-500/20 hover:text-indigo-200'
                      }`}
                    >
                      {active && !paused ? <Pause size={14} /> : <Headphones size={14} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white/85" title={file.path}>
                        {titleOf(file)}
                      </p>
                      <p className="text-[11px] text-white/35">
                        {formatBytes(file.size)}
                        {duration != null && ` · ${formatDuration(duration)}`}
                        {active && (
                          <span className="ml-1.5 text-indigo-300/80">previewing</span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        void enqueue(
                          [toTrackInput(file, duration)],
                          `Added “${titleOf(file)}” to the Discord queue`
                        )
                      }
                      title="Add to the Discord queue"
                      aria-label={`Add ${file.name} to the Discord queue`}
                      className="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] font-medium text-white/60 transition-colors hover:border-indigo-400/50 hover:bg-indigo-500/15 hover:text-indigo-200"
                    >
                      <Plus size={12} />
                      Queue
                    </button>
                    <button
                      onClick={() => remove(file)}
                      title="Remove from this list"
                      aria-label={`Remove ${file.name}`}
                      className="shrink-0 rounded-lg p-1.5 text-white/30 transition-colors hover:bg-white/10 hover:text-white/70"
                    >
                      <X size={14} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {playingFile ? (
            <div className="shrink-0 border-t border-indigo-500/25 bg-indigo-500/[0.07] px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 rounded-full bg-indigo-500/25 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-indigo-200">
                  <Headphones size={10} />
                  Preview
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-white/80">
                  {titleOf(playingFile)}
                </span>
                <span className="shrink-0 text-[10px] text-white/35">
                  this device only
                </span>
                <button
                  onClick={stopPreview}
                  title="Stop preview"
                  aria-label="Stop preview"
                  className="shrink-0 rounded p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X size={13} />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2.5">
                <button
                  onClick={() => togglePreview(playingFile)}
                  title={paused ? 'Resume preview' : 'Pause preview'}
                  aria-label={paused ? 'Resume preview' : 'Pause preview'}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 transition-colors hover:bg-indigo-400"
                >
                  {paused ? <Play size={12} className="ml-0.5" /> : <Pause size={12} />}
                </button>
                <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-white/45">
                  {formatClock(position)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={playingDuration ?? 100}
                  step={0.5}
                  value={Math.min(position, playingDuration ?? position)}
                  disabled={!playingDuration}
                  onChange={(e) => seekPreview(Number(e.target.value))}
                  aria-label="Seek preview"
                  className="slider slider-seek flex-1"
                  style={{
                    background: `linear-gradient(90deg, rgba(129,140,248,0.9) ${
                      playingDuration
                        ? Math.min(100, (position / playingDuration) * 100)
                        : 0
                    }%, rgba(255,255,255,0.10) ${
                      playingDuration
                        ? Math.min(100, (position / playingDuration) * 100)
                        : 0
                    }%)`
                  }}
                />
                <span className="w-9 shrink-0 text-[10px] tabular-nums text-white/45">
                  {playingDuration ? formatClock(playingDuration) : '--:--'}
                </span>
              </div>
            </div>
          ) : (
            files.length > 0 && (
              <p className="shrink-0 border-t border-white/5 px-3.5 py-1.5 text-center text-[11px] text-white/30">
                Drop more audio files anywhere on this panel to import them.
              </p>
            )
          )}
        </div>
      )}

      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onEnded={stopPreview}
        onError={() => {
          if (playingFile) flash(`Couldn't play ${playingFile.name}`)
          stopPreview()
        }}
        className="hidden"
      />
    </div>
  )
}
