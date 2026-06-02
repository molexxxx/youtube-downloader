import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { DownloadJob } from '@shared/types'

const { spawnMock, children, cookiesEnabledMock, loggerMock } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require('events')
  class FakeChild extends EventEmitter {
    stdout = new EventEmitter()
    stderr = new EventEmitter()
    kill = vi.fn()
  }
  const children: InstanceType<typeof FakeChild>[] = []
  const spawnMock = vi.fn((_cmd: string, _args: string[]) => {
    const child = new FakeChild()
    children.push(child)
    return child
  })
  return {
    spawnMock,
    children,
    cookiesEnabledMock: vi.fn(() => true),
    loggerMock: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }
  }
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
    cookiesFromBrowser: 'chrome'
  })
}))
vi.mock('@main/binaries/ffmpeg-binary', () => ({ ffmpegDir: () => '/bin' }))
vi.mock('@main/binaries/ytdlp-binary', () => ({ ytdlpPath: () => '/bin/yt-dlp' }))
vi.mock('@main/logger', () => ({ logger: loggerMock }))
vi.mock('@main/ytdlp/cookies', () => ({
  cookieArgs: () => ['--cookies', '/userdata/cookies.txt'],
  cookiesEnabled: cookiesEnabledMock,
  isAuthRequiredError: (error: unknown): boolean => {
    const message = error instanceof Error ? error.message : String(error)
    return /sign in to confirm|private video|members[- ]only|not a bot/i.test(message)
  }
}))

import { DownloadManager } from '@main/ytdlp/downloader'

beforeEach(() => {
  spawnMock.mockClear()
  children.length = 0
  cookiesEnabledMock.mockClear()
  cookiesEnabledMock.mockReturnValue(true)
  loggerMock.warn.mockClear()
})

describe('DownloadManager cookie retry', () => {
  it('spawns cookie-free first', () => {
    const manager = new DownloadManager()
    manager.enqueue({ url: 'https://x', kind: 'video' })
    expect(spawnMock).toHaveBeenCalledTimes(1)
    const args = spawnMock.mock.calls[0][1] as string[]
    expect(args).not.toContain('--cookies')
  })
  it('retries with cookies on an authentication error', () => {
    const manager = new DownloadManager()
    const job = manager.enqueue({ url: 'https://x', kind: 'video' })
    const first = children[0]
    first.stderr.emit('data', Buffer.from('ERROR: Sign in to confirm your age\n'))
    first.emit('close', 1)

    expect(spawnMock).toHaveBeenCalledTimes(2)
    const retryArgs = spawnMock.mock.calls[1][1] as string[]
    expect(retryArgs).toContain('--cookies')
    expect(loggerMock.warn).toHaveBeenCalled()

    // The retry succeeds and the job completes.
    children[1].emit('close', 0)
    const last = manager.list().find((j) => j.id === job.id)!
    expect(last.state).toBe('completed')
  })

  it('does not retry for an ordinary error', () => {
    const manager = new DownloadManager()
    const job = manager.enqueue({ url: 'https://x', kind: 'video' })
    const child = children[0]
    child.stderr.emit('data', Buffer.from('ERROR: Video unavailable\n'))
    child.emit('close', 1)

    expect(spawnMock).toHaveBeenCalledTimes(1)
    const last = manager.list().find((j) => j.id === job.id)! as DownloadJob
    expect(last.state).toBe('error')
  })

  it('does not retry twice', () => {
    const manager = new DownloadManager()
    const job = manager.enqueue({ url: 'https://x', kind: 'video' })
    children[0].stderr.emit('data', Buffer.from('ERROR: Private video\n'))
    children[0].emit('close', 1)
    expect(spawnMock).toHaveBeenCalledTimes(2)

    // The cookie retry also fails with an auth error → no third attempt.
    children[1].stderr.emit('data', Buffer.from('ERROR: Private video\n'))
    children[1].emit('close', 1)
    expect(spawnMock).toHaveBeenCalledTimes(2)
    const last = manager.list().find((j) => j.id === job.id)!
    expect(last.state).toBe('error')
  })
})
