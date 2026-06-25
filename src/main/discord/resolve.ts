import type { TrackInput } from '@shared/types'
import { getInfo, search } from '../ytdlp/resolver'

function isUrl(value: string): boolean {
  try {
    return Boolean(new URL(value))
  } catch {
    return false
  }
}

/**
 * Turn a slash-command query into enqueue-ready tracks, reusing the existing
 * yt-dlp resolver. A URL resolves to its video (or every entry of a playlist);
 * free text resolves to the top YouTube search hit.
 */
export async function resolveQueryToTracks(query: string): Promise<TrackInput[]> {
  const q = query.trim()
  if (isUrl(q)) {
    const info = await getInfo(q)
    if (info.isPlaylist) {
      return info.entries
        .filter((e) => e.url)
        .map((e) => ({
          title: e.title,
          url: e.url,
          duration: e.duration,
          thumbnail: e.thumbnail
        }))
    }
    return [
      {
        title: info.title,
        url: info.webpageUrl || q,
        duration: info.duration,
        thumbnail: info.thumbnail
      }
    ]
  }
  const results = await search(q, 1)
  return results
    .filter((e) => e.url)
    .map((e) => ({ title: e.title, url: e.url, duration: e.duration, thumbnail: e.thumbnail }))
}
