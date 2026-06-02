import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { DownloadJob } from '@shared/types'

const { spawnMock, children, maxRef } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require('events')
  class FakeChild extends EventEmitter {
    stdout = new EventEmitter()
    stderr = new EventEmitter()
    kill = vi.fn(function (this: { emit: (e: string, c: number) => void }) {
      // Emulate yt-dlp exiting after a kill signal.
      this.emit('close', 1)
    })
  }
  const children: InstanceType<typeof FakeChild>[] = []
  const spawnMock = vi.fn(() => {
    const child = new FakeChild()
    children.push(child)
    return child
  })
  return { spawnMock, children, maxRef: { value: 3 } }
})

vi.mock('child_process', () => ({ spawn: spawnMock }))
vi.mock('@main/config', () => ({
  getConfig: () => ({
    downloadDir: '/downloads',
    outputTemplate: '%(title)s.%(ext)s',
    maxConcurrentDownloads: maxRef.value,
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

beforeEach(() => {
  spawnMock.mockClear()
  children.length = 0
  maxRef.value = 3
})

function latestChild(): (typeof children)[number] {
  return children[children.length - 1]
}

describe('DownloadManager progress', () => {
  it('parses a JSON progress line into percent/speed/eta', () => {
    const manager = new DownloadManager()
    const updates: DownloadJob[] = []
    manager.on('update', (j: DownloadJob) => updates.push(j))

    const job = manager.enqueue({ url: 'https://x', kind: 'video' })
    latestChild().stdout.emit(
      'data',
      Buffer.from('progress:{"percent":"42.5%","speed":"1.2MiB/s","eta":"00:30"}\n')
    )

    const last = manager.list().find((j) => j.id === job.id)!
    expect(last.percent).toBeCloseTo(42.5)
    expect(last.speed).toBe('1.2MiB/s')
    expect(last.eta).toBe('00:30')
  })

  it('treats NA speed/eta fields as null', () => {
    const manager = new DownloadManager()
    const job = manager.enqueue({ url: 'https://x', kind: 'video' })
    latestChild().stdout.emit(
      'data',
      Buffer.from('progress:{"percent":"5%","speed":"NA","eta":"NA"}\n')
    )
    const last = manager.list().find((j) => j.id === job.id)!
    expect(last.speed).toBeNull()
    expect(last.eta).toBeNull()
  })

  it('ignores malformed progress lines', () => {
    const manager = new DownloadManager()
    const job = manager.enqueue({ url: 'https://x', kind: 'video' })
    latestChild().stdout.emit('data', Buffer.from('progress:{not json}\n'))
    const last = manager.list().find((j) => j.id === job.id)!
    expect(last.percent).toBe(0)
  })

  it('reassembles a progress line split across two stdout chunks', () => {
    const manager = new DownloadManager()
    const job = manager.enqueue({ url: 'https://x', kind: 'video' })
    const child = latestChild()
    // Node delivers stdout in arbitrary chunks; a line can arrive in pieces.
    child.stdout.emit('data', Buffer.from('progress:{"percent":"63.0%","spe'))
    child.stdout.emit('data', Buffer.from('ed":"2.0MiB/s","eta":"00:10"}\n'))
    const last = manager.list().find((j) => j.id === job.id)!
    expect(last.percent).toBeCloseTo(63)
    expect(last.speed).toBe('2.0MiB/s')
    expect(last.eta).toBe('00:10')
  })

  it('parses multiple progress lines arriving in a single chunk', () => {
    const manager = new DownloadManager()
    const job = manager.enqueue({ url: 'https://x', kind: 'video' })
    latestChild().stdout.emit(
      'data',
      Buffer.from(
        'progress:{"percent":"10%","speed":"1MiB/s","eta":"00:50"}\n' +
          'progress:{"percent":"20%","speed":"1MiB/s","eta":"00:40"}\n'
      )
    )
    const last = manager.list().find((j) => j.id === job.id)!
    expect(last.percent).toBeCloseTo(20)
  })

  it('moves to processing on a merge line and records the destination', () => {
    const manager = new DownloadManager()
    const job = manager.enqueue({ url: 'https://x', kind: 'video' })
    const child = latestChild()
    child.stdout.emit('data', Buffer.from('[download] Destination: /downloads/clip.mp4\n'))
    child.stdout.emit('data', Buffer.from('[Merger] Merging formats\n'))
    const last = manager.list().find((j) => j.id === job.id)!
    expect(last.outputPath).toBe('/downloads/clip.mp4')
    expect(last.state).toBe('processing')
  })

  it('captures the final merged path from the Merger line', () => {
    const manager = new DownloadManager()
    const job = manager.enqueue({ url: 'https://x', kind: 'video' })
    const child = latestChild()
    // The per-stream destination is an intermediate file deleted after merge.
    child.stdout.emit('data', Buffer.from('[download] Destination: /downloads/clip.f401.mp4\n'))
    child.stdout.emit(
      'data',
      Buffer.from('[Merger] Merging formats into "/downloads/clip.mp4"\n')
    )
    const last = manager.list().find((j) => j.id === job.id)!
    expect(last.outputPath).toBe('/downloads/clip.mp4')
    expect(last.state).toBe('processing')
  })

  it('captures the extracted audio destination as the final path', () => {
    const manager = new DownloadManager()
    const job = manager.enqueue({ url: 'https://x', kind: 'audio' })
    const child = latestChild()
    child.stdout.emit('data', Buffer.from('[download] Destination: /downloads/song.webm\n'))
    child.stdout.emit('data', Buffer.from('[ExtractAudio] Destination: /downloads/song.mp3\n'))
    const last = manager.list().find((j) => j.id === job.id)!
    expect(last.outputPath).toBe('/downloads/song.mp3')
    expect(last.state).toBe('processing')
  })
})

describe('DownloadManager completion + errors', () => {
  it('marks a job completed at 100% on exit code 0', () => {
    const manager = new DownloadManager()
    const job = manager.enqueue({ url: 'https://x', kind: 'video' })
    latestChild().emit('close', 0)
    const last = manager.list().find((j) => j.id === job.id)!
    expect(last.state).toBe('completed')
    expect(last.percent).toBe(100)
  })

  it('captures the yt-dlp ERROR line as the failure reason', () => {
    const manager = new DownloadManager()
    const job = manager.enqueue({ url: 'https://x', kind: 'video' })
    const child = latestChild()
    child.stderr.emit('data', Buffer.from('ERROR: Video unavailable\n'))
    child.emit('close', 1)
    const last = manager.list().find((j) => j.id === job.id)!
    expect(last.state).toBe('error')
    expect(last.error).toBe('Video unavailable')
  })

  it('falls back to the exit code when no ERROR line was seen', () => {
    const manager = new DownloadManager()
    const job = manager.enqueue({ url: 'https://x', kind: 'video' })
    latestChild().emit('close', 2)
    const last = manager.list().find((j) => j.id === job.id)!
    expect(last.state).toBe('error')
    expect(last.error).toContain('2')
  })

  it('marks a job errored when the process emits error', () => {
    const manager = new DownloadManager()
    const job = manager.enqueue({ url: 'https://x', kind: 'video' })
    latestChild().emit('error', new Error('spawn ENOENT'))
    const last = manager.list().find((j) => j.id === job.id)!
    expect(last.state).toBe('error')
    expect(last.error).toBe('spawn ENOENT')
  })
})

describe('DownloadManager cancel + concurrency', () => {
  it('cancels a running job by killing the child', () => {
    const manager = new DownloadManager()
    const job = manager.enqueue({ url: 'https://x', kind: 'video' })
    const child = latestChild()
    manager.cancel(job.id)
    expect(child.kill).toHaveBeenCalled()
  })

  it('cancels a queued job without spawning it', () => {
    maxRef.value = 1
    const manager = new DownloadManager()
    manager.enqueue({ url: 'https://a', kind: 'video' })
    const queued = manager.enqueue({ url: 'https://b', kind: 'video' })
    expect(spawnMock).toHaveBeenCalledTimes(1)

    manager.cancel(queued.id)
    const last = manager.list().find((j) => j.id === queued.id)!
    expect(last.state).toBe('cancelled')
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })

  it('respects the concurrency limit and pumps the queue as jobs finish', () => {
    maxRef.value = 1
    const manager = new DownloadManager()
    manager.enqueue({ url: 'https://a', kind: 'video' })
    manager.enqueue({ url: 'https://b', kind: 'video' })
    expect(spawnMock).toHaveBeenCalledTimes(1)

    // Finish the first job → the queued one should start.
    children[0].emit('close', 0)
    expect(spawnMock).toHaveBeenCalledTimes(2)
  })
})

describe('DownloadManager concurrent correctness', () => {
  it('tracks two concurrent jobs independently when they finish out of order', () => {
    const manager = new DownloadManager()
    const a = manager.enqueue({ url: 'https://a', kind: 'video' })
    const b = manager.enqueue({ url: 'https://b', kind: 'video' })
    expect(spawnMock).toHaveBeenCalledTimes(2)

    const childA = children[0]
    const childB = children[1]

    // Job B progresses, then finishes first - job A must stay downloading.
    childB.stdout.emit(
      'data',
      Buffer.from('progress:{"percent":"50%","speed":"1MiB/s","eta":"00:10"}\n')
    )
    childB.emit('close', 0)

    let jobA = manager.list().find((j) => j.id === a.id)!
    let jobB = manager.list().find((j) => j.id === b.id)!
    expect(jobB.state).toBe('completed')
    expect(jobB.percent).toBe(100)
    expect(jobA.state).toBe('downloading')
    expect(jobA.percent).toBe(0)

    // Job A progresses and finishes afterwards - B stays completed, unaffected.
    childA.stdout.emit(
      'data',
      Buffer.from('progress:{"percent":"75%","speed":"2MiB/s","eta":"00:05"}\n')
    )
    childA.emit('close', 0)

    jobA = manager.list().find((j) => j.id === a.id)!
    jobB = manager.list().find((j) => j.id === b.id)!
    expect(jobA.state).toBe('completed')
    expect(jobA.percent).toBe(100)
    expect(jobB.state).toBe('completed')
  })

  it('ignores a late progress line that arrives after a job completed', () => {
    const manager = new DownloadManager()
    const job = manager.enqueue({ url: 'https://x', kind: 'video' })
    const child = latestChild()
    child.emit('close', 0)
    // A stray buffered progress line must not revive a finished job.
    child.stdout.emit(
      'data',
      Buffer.from('progress:{"percent":"30%","speed":"1MiB/s","eta":"00:20"}\n')
    )
    const last = manager.list().find((j) => j.id === job.id)!
    expect(last.state).toBe('completed')
    expect(last.percent).toBe(100)
  })

  it('does not dedupe downloads of the same URL with different formats', () => {
    const manager = new DownloadManager()
    const hd = manager.enqueue({ url: 'https://x', kind: 'video', formatId: '137' })
    const sd = manager.enqueue({ url: 'https://x', kind: 'video', formatId: '136' })
    expect(sd.id).not.toBe(hd.id)
    expect(manager.list()).toHaveLength(2)
  })

  it('uses the provided title for the queue, falling back to the URL', () => {
    const manager = new DownloadManager()
    const named = manager.enqueue({ url: 'https://x', kind: 'video', title: 'My Clip' })
    const bare = manager.enqueue({ url: 'https://y', kind: 'video' })
    expect(named.title).toBe('My Clip')
    expect(bare.title).toBe('https://y')
  })
})
