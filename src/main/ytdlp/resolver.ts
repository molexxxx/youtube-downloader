import { create as createYtDlp, type Create } from 'youtube-dl-exec'
import type { MediaInfo, PlaylistEntry, VideoFormat } from '@shared/types'
import { getConfig } from '../config'
import { logger } from '../logger'
import { ffmpegDir } from '../binaries/ffmpeg-binary'
import { ytdlpPath } from '../binaries/ytdlp-binary'
import { cookieFlags, cookiesEnabled, isAuthRequiredError } from './cookies'

type YtDlpEngine = ReturnType<Create>

let engine: YtDlpEngine | null = null

export function ytdlp(): YtDlpEngine {
  if (!engine) {
    engine = createYtDlp(ytdlpPath())
  }
  return engine
}

/** Flags applied to every yt-dlp invocation. */
export function baseFlags(includeCookies = true): Record<string, unknown> {
  const cfg = getConfig()
  const flags: Record<string, unknown> = {
    ignoreConfig: true,
    noWarnings: true,
    noCheckCertificates: true,
    ffmpegLocation: ffmpegDir()
  }
  return includeCookies ? { ...flags, ...cookieFlags(cfg) } : flags
}

interface RawFormat {
  format_id?: string
  ext?: string
  resolution?: string
  height?: number
  width?: number
  fps?: number
  vcodec?: string
  acodec?: string
  filesize?: number
  filesize_approx?: number
  tbr?: number
  format_note?: string
}

interface RawInfo {
  id?: string
  title?: string
  uploader?: string
  channel?: string
  duration?: number
  thumbnail?: string
  thumbnails?: { url?: string; width?: number; height?: number }[]
  url?: string
  webpage_url?: string
  original_url?: string
  _type?: string
  playlist_count?: number
  formats?: RawFormat[]
  entries?: RawInfo[]
}

export function mapFormat(raw: RawFormat): VideoFormat {
  const resolution =
    raw.resolution ?? (raw.height ? `${raw.width ?? ''}x${raw.height}` : null)
  return {
    formatId: raw.format_id ?? '',
    ext: raw.ext ?? '',
    resolution: resolution ?? null,
    fps: raw.fps ?? null,
    vcodec: raw.vcodec && raw.vcodec !== 'none' ? raw.vcodec : null,
    acodec: raw.acodec && raw.acodec !== 'none' ? raw.acodec : null,
    filesize: raw.filesize ?? raw.filesize_approx ?? null,
    tbr: raw.tbr ?? null,
    note: raw.format_note ?? null
  }
}

function pickThumbnail(raw: RawInfo): string | null {
  if (raw.thumbnail) return raw.thumbnail
  // Flat-playlist/search entries expose a `thumbnails` array instead of a
  // single `thumbnail`; choose the largest available.
  if (raw.thumbnails?.length) {
    const best = raw.thumbnails
      .filter((t) => t.url)
      .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]
    if (best?.url) return best.url
  }
  // Last resort: build the canonical YouTube thumbnail from the video id so
  // flat search results still render a preview.
  if (raw.id && /^[\w-]{11}$/.test(raw.id)) {
    return `https://i.ytimg.com/vi/${raw.id}/mqdefault.jpg`
  }
  return null
}

function mapEntry(raw: RawInfo): PlaylistEntry {
  return {
    id: raw.id ?? '',
    title: raw.title ?? 'Untitled',
    // Flat-playlist/search entries expose the video link as `url`; full probes
    // use `webpage_url`. Prefer whichever is present so a clicked result always
    // carries a real URL.
    url: raw.webpage_url || raw.url || raw.original_url || '',
    duration: raw.duration ?? null,
    thumbnail: pickThumbnail(raw),
    uploader: raw.uploader ?? raw.channel ?? null
  }
}

export function mapInfo(raw: RawInfo): MediaInfo {
  const isPlaylist = raw._type === 'playlist' || Array.isArray(raw.entries)
  return {
    id: raw.id ?? '',
    title: raw.title ?? 'Untitled',
    uploader: raw.uploader ?? raw.channel ?? null,
    duration: raw.duration ?? null,
    thumbnail: pickThumbnail(raw),
    webpageUrl: raw.webpage_url ?? raw.original_url ?? '',
    isPlaylist,
    playlistCount: raw.playlist_count ?? raw.entries?.length ?? 0,
    formats: (raw.formats ?? []).map(mapFormat),
    entries: isPlaylist ? (raw.entries ?? []).map(mapEntry) : []
  }
}

/**
 * Whether a URL should be treated as a playlist rather than a single video.
 *
 * A `watch?v=...` link is always a single video, even when it carries a
 * `&list=...` (e.g. opened from within a playlist) - pasting such a link should
 * grab just that video. A bare `/playlist?list=...`, a `list=` URL without a
 * video id, or a channel page is a true playlist/collection.
 */
export function isPlaylistUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  // youtu.be/<id> and watch?v=<id> are single videos regardless of any list=.
  if (parsed.searchParams.has('v')) return false
  if (/(^|\.)youtu\.be$/i.test(parsed.hostname)) return false
  return parsed.pathname.includes('/playlist') || parsed.searchParams.has('list')
}

/** Probe a URL for metadata and available formats. */
export async function getInfo(url: string, forcePlaylist = false): Promise<MediaInfo> {
  // `forcePlaylist` is set when the user explicitly chose "entire playlist" for a
  // watch?v=...&list=... link. Resolving the original watch URL with playlist
  // mode works for both real playlists and Mix/radio lists, whereas a bare
  // playlist?list=RD... URL is rejected by YouTube as "unviewable".
  const playlist = forcePlaylist || isPlaylistUrl(url)
  const probe = (includeCookies: boolean): Promise<RawInfo> => {
    const opts: Record<string, unknown> = {
      ...baseFlags(includeCookies),
      dumpSingleJson: true,
      // Playlists/channels: extract a flat entry list only. A full per-video
      // probe of a large playlist is painfully slow and unnecessary - formats
      // are resolved later when an individual item is downloaded.
      flatPlaylist: playlist
    }
    // A watch?v=... URL is a single video even if it carries a list=; never let
    // yt-dlp expand it into the whole playlist.
    if (!playlist) {
      opts.noPlaylist = true
    } else {
      // Cap how many items we paginate through. Large Mix/radio lists can run
      // into the hundreds and each page is a sequential network round-trip, so
      // a limit keeps resolve times reasonable. 0 disables the cap.
      const limit = getConfig().playlistFetchLimit
      if (limit > 0) opts.playlistItems = `1:${limit}`
    }
    return ytdlp()(url, opts) as unknown as Promise<RawInfo>
  }

  // Cookie-free is the fast, reliable path: authenticated YouTube sessions often
  // advertise only SABR/storyboard formats that break public downloads. Only
  // fall back to cookies when a video genuinely needs auth (private, age-gated,
  // members-only) or YouTube bot-flags this client.
  logger.info(`Resolving ${playlist ? 'playlist' : 'video'}:`, url)
  try {
    const info = mapInfo(await probe(false))
    logger.info(
      `Resolved "${info.title}"`,
      info.isPlaylist ? `(${info.playlistCount} items)` : `(${info.formats.length} formats)`
    )
    return info
  } catch (err) {
    if (!cookiesEnabled() || !isAuthRequiredError(err)) throw err
    logger.warn('Probe needs authentication, retrying with cookies:', url)
    const info = mapInfo(await probe(true))
    logger.info(`Resolved "${info.title}" with cookies`)
    return info
  }
}

/**
 * Fetch a single page of flat playlist entries (used by the UI's "Load more"
 * after the initial fetch limit). `start`/`end` are 1-based, inclusive, matching
 * yt-dlp's `--playlist-items START:END` selector.
 */
export async function getPlaylistPage(
  url: string,
  start: number,
  end: number
): Promise<PlaylistEntry[]> {
  const probe = (includeCookies: boolean): Promise<RawInfo> =>
    ytdlp()(url, {
      ...baseFlags(includeCookies),
      dumpSingleJson: true,
      flatPlaylist: true,
      playlistItems: `${start}:${end}`
    }) as unknown as Promise<RawInfo>

  logger.info(`Fetching playlist page ${start}:${end} for`, url)
  try {
    const raw = await probe(false)
    return (raw.entries ?? []).map(mapEntry)
  } catch (err) {
    if (!cookiesEnabled() || !isAuthRequiredError(err)) throw err
    logger.warn('Playlist page needs authentication, retrying with cookies:', url)
    const raw = await probe(true)
    return (raw.entries ?? []).map(mapEntry)
  }
}

/** Search YouTube via the ytsearch pseudo-extractor (no API key needed). */
export async function search(query: string, limit = 15): Promise<PlaylistEntry[]> {
  const raw = (await ytdlp()(`ytsearch${limit}:${query}`, {
    ...baseFlags(false),
    dumpSingleJson: true,
    flatPlaylist: true
  })) as unknown as RawInfo
  const entries = (raw.entries ?? []).map(mapEntry)
  logger.info(`Search "${query}" returned ${entries.length} results`)
  return entries
}
