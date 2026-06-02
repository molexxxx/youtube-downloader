/**
 * Smart download presets - shared across processes so the renderer can present
 * them and `config.defaultPreset` can reference them by id.
 */
import type { AudioFormat, DownloadKind, VideoContainer } from './types'

export interface Preset {
  id: string
  label: string
  kind: DownloadKind
  /** Container to use for video presets. */
  container?: VideoContainer
  /** Audio codec to extract for audio presets. */
  audioFormat?: AudioFormat
  /** Cap the chosen video height; null means best available. */
  maxHeight?: number | null
}

export const PRESETS: Preset[] = [
  { id: 'best-mp4', label: 'Best MP4', kind: 'video', container: 'mp4', maxHeight: null },
  { id: '1080p-mp4', label: '1080p MP4', kind: 'video', container: 'mp4', maxHeight: 1080 },
  { id: '720p-mp4', label: '720p MP4', kind: 'video', container: 'mp4', maxHeight: 720 },
  { id: 'best-mkv', label: 'Best MKV', kind: 'video', container: 'mkv', maxHeight: null },
  { id: 'audio-mp3', label: 'Audio MP3', kind: 'audio', audioFormat: 'mp3' },
  { id: 'audio-flac', label: 'Audio FLAC', kind: 'audio', audioFormat: 'flac' }
]

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id)
}
