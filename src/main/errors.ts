/**
 * Turns the noisy errors thrown by yt-dlp / youtube-dl-exec into a short,
 * user-facing message. yt-dlp writes diagnostics to stderr and youtube-dl-exec
 * surfaces them in the Error message, often prefixed with `ERROR:`.
 */
export function cleanErrorMessage(err: unknown): string {
  const raw =
    err instanceof Error ? err.message : typeof err === 'string' ? err : String(err)

  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  // Prefer the first line yt-dlp marks as an error.
  const errorLine = lines.find((l) => /^ERROR:/i.test(l))
  const chosen = errorLine ?? lines[0] ?? 'Something went wrong'

  const message = chosen
    .replace(/^ERROR:\s*/i, '')
    .replace(/^\[[^\]]+\]\s*/, '') // strip a leading [extractor] tag
    .trim()

  return message || 'Something went wrong'
}
