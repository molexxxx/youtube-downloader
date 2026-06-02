import { describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require('events')
  // Fake child process that stays "running" so enqueued jobs remain active.
  class FakeChild extends EventEmitter {
    stdout = new EventEmitter()
    stderr = new EventEmitter()
    kill = vi.fn()
  }
  return { spawnMock: vi.fn(() => new FakeChild()) }
})

vi.mock('child_process', () => ({ spawn: spawnMock }))
vi.mock('@main/config', () => ({
  getConfig: () => ({
    downloadDir: '/downloads',
    outputTemplate: '%(title)s.%(ext)s',
    maxConcurrentDownloads: 3,
    videoContainer: 'mp4',
    embedThumbnail: false,
    embedMetadata: false,
    embedChapters: false,
    writeSubtitles: false,
    subtitleLangs: [],
    sponsorBlock: false,
    useDownloadArchive: false,
    cookiesFromBrowser: null
  })
}))
vi.mock('@main/binaries/ffmpeg-binary', () => ({ ffmpegDir: () => '/bin' }))
vi.mock('@main/binaries/ytdlp-binary', () => ({ ytdlpPath: () => '/bin/yt-dlp' }))

import { DownloadManager } from '@main/ytdlp/downloader'

describe('DownloadManager dedupe', () => {
  it('returns the same job for an identical active request', () => {
    const manager = new DownloadManager()
    const first = manager.enqueue({ url: 'https://x', kind: 'video' })
    const second = manager.enqueue({ url: 'https://x', kind: 'video' })
    expect(second.id).toBe(first.id)
    expect(manager.list()).toHaveLength(1)
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })

  it('creates separate jobs for different kinds', () => {
    const manager = new DownloadManager()
    const video = manager.enqueue({ url: 'https://y', kind: 'video' })
    const audio = manager.enqueue({ url: 'https://y', kind: 'audio' })
    expect(audio.id).not.toBe(video.id)
    expect(manager.list()).toHaveLength(2)
  })
})
