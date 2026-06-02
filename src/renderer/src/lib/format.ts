export function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`
}

export function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/**
 * True when the input looks like a URL (so it should be resolved directly).
 * Otherwise it is treated as a search query.
 */
export function looksLikeUrl(input: string): boolean {
  const trimmed = input.trim()
  if (!trimmed || /\s/.test(trimmed)) return false
  if (/^https?:\/\//i.test(trimmed)) return true
  // bare domains like youtube.com/watch?v=...
  return /^[\w-]+(\.[\w-]+)+(\/|$)/.test(trimmed)
}
