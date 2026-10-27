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
 * trigger key plus a dismissable raised panel anchored to the search row.
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
  const previewPct = playingDuration
    ? Math.min(100, (position / playingDuration) * 100)
    : 0

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
        className={`key key-line h-11 shrink-0 px-4 text-sm ${
          open ? 'border-[var(--w-blue)] text-[var(--t-blue)]' : ''
        }`}
      >
        <HardDriveUpload size={16} />
        Local
        {files.length > 0 && (
          <span className="tabular-nums text-[var(--t-dim)]">{files.length}</span>
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
          className={`sheet absolute left-0 right-0 top-full z-30 mt-3 flex max-h-[440px] flex-col overflow-hidden rounded-sm border-2 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.6)] transition-colors ${
            dragging ? 'border-[var(--w-blue)]' : 'border-transparent'
          }`}
        >
          <div className="flex shrink-0 items-center gap-4 border-b border-[var(--t-rule-strong)] px-5 py-3">
            <span className="text-sm font-semibold">
              {files.length === 0
                ? 'Local audio'
                : `${files.length} file${files.length === 1 ? '' : 's'}`}
            </span>
            {notice && (
              <span className="truncate text-[13px] text-[var(--t-dim)]">{notice}</span>
            )}
            <div className="ml-auto flex items-center gap-4">
              <button
                onClick={() => void browse()}
                className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--t-blue)] transition-opacity hover:opacity-80"
              >
                <FolderOpen size={14} />
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
                  className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--t-blue)] transition-opacity hover:opacity-80"
                >
                  <ListPlus size={14} />
                  Queue all
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                title="Close"
                aria-label="Close local files"
                className="rounded-sm p-1 text-[var(--t-dim)] transition-colors hover:bg-[var(--t-hover)] hover:text-[var(--t-fg)]"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {files.length === 0 ? (
            <button
              onClick={() => void browse()}
              className={`m-4 flex flex-col items-center gap-2 rounded-sm border-2 border-dashed px-6 py-9 text-sm font-semibold transition-colors ${
                dragging
                  ? 'border-[var(--w-blue)] text-[var(--t-blue)]'
                  : 'border-[var(--t-rule-strong)] text-[var(--t-dim)] hover:border-[var(--w-blue)] hover:text-[var(--t-fg)]'
              }`}
            >
              <Music size={22} />
              Drop audio files here, or click to browse
            </button>
          ) : (
            <ul className="scroll-ink min-h-0 flex-1 overflow-y-auto">
              {files.map((file) => {
                const active = playingPath === file.path
                const duration = durations[file.path] ?? null
                return (
                  <li
                    key={file.path}
                    className={`flex items-center gap-3 border-b border-[var(--t-rule)] py-2.5 pl-5 pr-2.5 ${
                      active ? 'bg-[var(--t-hover)]' : ''
                    }`}
                  >
                    <button
                      onClick={() => togglePreview(file)}
                      title="Preview on this device (not in Discord)"
                      aria-label={
                        active && !paused ? `Pause ${file.name}` : `Preview ${file.name}`
                      }
                      className={`key h-8 w-8 shrink-0 ${
                        active ? 'key-blue' : 'key-line text-[var(--t-dim)]'
                      }`}
                    >
                      {active && !paused ? <Pause size={14} /> : <Headphones size={14} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold" title={file.path}>
                        {titleOf(file)}
                      </p>
                      <p className="text-xs text-[var(--t-dim)]">
                        {formatBytes(file.size)}
                        {duration != null && ` · ${formatDuration(duration)}`}
                        {active && (
                          <span className="ml-1.5 font-semibold text-[var(--t-blue)]">
                            previewing
                          </span>
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
                      className="key key-line h-8 shrink-0 px-2.5 text-xs hover:border-[var(--w-blue)] hover:text-[var(--t-blue)]"
                    >
                      <Plus size={13} />
                      Queue
                    </button>
                    <button
                      onClick={() => remove(file)}
                      title="Remove from this list"
                      aria-label={`Remove ${file.name}`}
                      className="shrink-0 rounded-sm p-1.5 text-[var(--t-dim)] transition-colors hover:bg-[var(--t-hover)] hover:text-[var(--t-fg)]"
                    >
                      <X size={14} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {playingFile ? (
            <div className="shrink-0 border-t-2 border-[var(--w-blue)] px-5 py-3">
              <div className="flex items-center gap-2.5">
                <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[var(--t-blue)]">
                  <Headphones size={13} />
                  Preview
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                  {titleOf(playingFile)}
                </span>
                <span className="shrink-0 text-xs text-[var(--t-dim)]">
                  this device only
                </span>
                <button
                  onClick={stopPreview}
                  title="Stop preview"
                  aria-label="Stop preview"
                  className="shrink-0 rounded-sm p-1 text-[var(--t-dim)] transition-colors hover:bg-[var(--t-hover)] hover:text-[var(--t-fg)]"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="mt-2.5 flex items-center gap-3">
                <button
                  onClick={() => togglePreview(playingFile)}
                  title={paused ? 'Resume preview' : 'Pause preview'}
                  aria-label={paused ? 'Resume preview' : 'Pause preview'}
                  className="key key-blue h-8 w-8 shrink-0"
                >
                  {paused ? <Play size={13} className="ml-0.5" /> : <Pause size={13} />}
                </button>
                <span className="w-9 shrink-0 text-right text-xs tabular-nums text-[var(--t-dim)]">
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
                  className="line-range line-range-thin flex-1"
                  style={{
                    background: `linear-gradient(90deg, var(--w-blue) ${previewPct}%, var(--t-rule-strong) ${previewPct}%)`
                  }}
                />
                <span className="w-9 shrink-0 text-xs tabular-nums text-[var(--t-dim)]">
                  {playingDuration ? formatClock(playingDuration) : '--:--'}
                </span>
              </div>
            </div>
          ) : (
            files.length > 0 && (
              <p className="shrink-0 px-5 py-2.5 text-center text-xs text-[var(--t-dim)]">
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
