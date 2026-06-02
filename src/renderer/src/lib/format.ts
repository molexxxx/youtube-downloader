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

/**
 * When a `watch?v=...` link also carries a `list=...` (i.e. it was opened from
 * within a playlist or a Mix/radio), return that list id so the UI can ask
 * whether the user wants just the single video or the whole list. Returns null
 * for bare playlist links and links without a list.
 */
export function playlistChoiceId(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
  } catch {
    return null
  }
  if (!parsed.searchParams.has('v')) return null
  const list = parsed.searchParams.get('list')
  if (!list) return null
  return list
}

/** Canonical playlist URL for a given YouTube list id. */
export function playlistUrl(listId: string): string {
  return `https://www.youtube.com/playlist?list=${listId}`
}

/**
 * True when an error message indicates the content needs an authenticated
 * session (private, age-restricted, members-only) or YouTube is bot-flagging
 * this client — the cases where supplying browser cookies can help. Mirrors the
 * main-process `isAuthRequiredError` so the UI can recommend setting up cookies.
 */
export function looksLikeAuthError(message: string): boolean {
  return (
    /sign in to confirm/i.test(message) ||
    /confirm your age|age[- ]restricted|inappropriate for some users/i.test(message) ||
    /private video/i.test(message) ||
    /members[- ]only|available to (this channel's |)members|join this channel/i.test(message) ||
    /requires payment|purchase/i.test(message) ||
    /not a bot/i.test(message) ||
    /login required|account/i.test(message)
  )
}
