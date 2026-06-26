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
          thumbnail: e.thumbnail,
          uploader: e.uploader
        }))
    }
    return [
      {
        title: info.title,
        url: info.webpageUrl || q,
        duration: info.duration,
        thumbnail: info.thumbnail,
        uploader: info.uploader
      }
    ]
  }
  return searchTracks(q, 1)
}

/** Top YouTube search hits as enqueue-ready tracks (used by interactive /search). */
export async function searchTracks(query: string, limit = 5): Promise<TrackInput[]> {
  const results = await search(query.trim(), limit)
  return results
    .filter((e) => e.url)
    .map((e) => ({
      title: e.title,
      url: e.url,
      duration: e.duration,
      thumbnail: e.thumbnail,
      uploader: e.uploader
    }))
}
