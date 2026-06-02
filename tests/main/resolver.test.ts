import { describe, expect, it, vi } from 'vitest'

vi.mock('@main/config', () => ({ getConfig: () => ({ cookiesFromBrowser: null }) }))
vi.mock('@main/binaries/ffmpeg-binary', () => ({ ffmpegDir: () => '/bin' }))
vi.mock('@main/binaries/ytdlp-binary', () => ({ ytdlpPath: () => '/bin/yt-dlp' }))
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
