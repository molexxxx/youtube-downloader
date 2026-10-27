import { describe, expect, it, vi } from 'vitest'

vi.mock('@main/config', () => ({ getConfig: () => ({ cookiesFromBrowser: null }) }))
vi.mock('@main/binaries/ffmpeg-binary', () => ({ ffmpegDir: () => '/bin' }))
vi.mock('@main/binaries/ytdlp-binary', () => ({
  ytdlpPath: () => '/bin/yt-dlp',
  trackYtdlp: <T>(child: T): T => child,
  managedEngine: <T>(engine: T): T => engine,
  ytdlpRuntimeArgs: () => ['--js-runtimes', 'node:/electron'],
  ytdlpRuntimeFlags: () => ({ jsRuntimes: 'node:/electron' }),
  ytdlpEnv: () => ({ ELECTRON_RUN_AS_NODE: '1' })
}))
vi.mock('youtube-dl-exec', () => ({ create: () => vi.fn() }))

import { mapFormat, mapInfo } from '@main/ytdlp/resolver'

describe('mapFormat', () => {
  it('maps a raw video format', () => {
    const f = mapFormat({
      format_id: '137',
      ext: 'mp4',
      height: 1080,
      width: 1920,
      fps: 30,
      vcodec: 'avc1',
      acodec: 'none',
      filesize: 1000,
      tbr: 2500,
      format_note: '1080p'
    })
    expect(f.formatId).toBe('137')
    expect(f.resolution).toBe('1920x1080')
    expect(f.vcodec).toBe('avc1')
    expect(f.acodec).toBeNull()
  })

  it('falls back to approximate filesize', () => {
    const f = mapFormat({ format_id: 'a', filesize_approx: 500 })
    expect(f.filesize).toBe(500)
  })
})

describe('mapInfo', () => {
  it('maps a single video', () => {
    const info = mapInfo({
      id: 'abc',
      title: 'Test',
      uploader: 'Chan',
      duration: 200,
      webpage_url: 'https://x',
      formats: [{ format_id: '18', ext: 'mp4', vcodec: 'avc1', height: 360 }]
    })
    expect(info.isPlaylist).toBe(false)
    expect(info.formats).toHaveLength(1)
    expect(info.entries).toHaveLength(0)
  })

  it('maps a playlist with entries', () => {
    const info = mapInfo({
      _type: 'playlist',
      title: 'List',
      entries: [
        { id: '1', title: 'One', webpage_url: 'https://1' },
        { id: '2', title: 'Two', webpage_url: 'https://2' }
      ]
    })
    expect(info.isPlaylist).toBe(true)
    expect(info.playlistCount).toBe(2)
    expect(info.entries[0].title).toBe('One')
  })
})

describe('result thumbnails', () => {
  const HQ720 = 'https://i.ytimg.com/vi/2BY9zc7XE08/hq720.jpg?sqp=a&rs=b'

  function entryThumbnail(entry: Record<string, unknown>): string | null {
    return mapInfo({ _type: 'playlist', entries: [entry] }).entries[0].thumbnail
  }

  it('uses the static medium thumbnail for YouTube results instead of the resized hq720', () => {
    const thumbnail = entryThumbnail({
      _type: 'url',
      ie_key: 'Youtube',
      id: '2BY9zc7XE08',
      url: 'https://www.youtube.com/watch?v=2BY9zc7XE08',
      thumbnails: [
        { url: HQ720, width: 360, height: 202 },
        { url: `${HQ720}2`, width: 720, height: 404 }
      ]
    })
    expect(thumbnail).toBe('https://i.ytimg.com/vi/2BY9zc7XE08/mqdefault.jpg')
  })

  it('picks the smallest thumbnail that is still wide enough for other sites', () => {
    const thumbnail = entryThumbnail({
      ie_key: 'Vimeo',
      id: '76979871',
      thumbnails: [
        { url: 'https://v/100.jpg', width: 100 },
        { url: 'https://v/1280.jpg', width: 1280 },
        { url: 'https://v/640.jpg', width: 640 }
      ]
    })
    expect(thumbnail).toBe('https://v/640.jpg')
  })

  it('falls back to the largest thumbnail when none is wide enough', () => {
    const thumbnail = entryThumbnail({
      ie_key: 'Vimeo',
      id: '76979871',
      thumbnails: [
        { url: 'https://v/100.jpg', width: 100 },
        { url: 'https://v/200.jpg', width: 200 }
      ]
    })
    expect(thumbnail).toBe('https://v/200.jpg')
  })

  it('keeps the full-size thumbnail for a single video', () => {
    const info = mapInfo({
      id: '2BY9zc7XE08',
      extractor_key: 'Youtube',
      thumbnail: 'https://i.ytimg.com/vi_webp/2BY9zc7XE08/maxresdefault.webp'
    })
    expect(info.thumbnail).toBe(
      'https://i.ytimg.com/vi_webp/2BY9zc7XE08/maxresdefault.webp'
    )
  })
})
