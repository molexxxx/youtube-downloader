import { describe, expect, it } from 'vitest'
import { binariesAreReady, useAppStore } from '@renderer/stores/appStore'
import type { BinariesStatus, DownloadJob, LogEntry, MediaInfo, PlaylistEntry } from '@shared/types'

function status(ytInstalled: boolean, ffInstalled: boolean): BinariesStatus {
  return {
    ytdlp: { name: 'yt-dlp', installed: ytInstalled, path: null, version: null },
    ffmpeg: { name: 'ffmpeg', installed: ffInstalled, path: null, version: null }
  }
}

describe('binariesAreReady', () => {
  it('is false when null', () => {
    expect(binariesAreReady(null)).toBe(false)
  })
  it('requires both binaries', () => {
    expect(binariesAreReady(status(true, false))).toBe(false)
    expect(binariesAreReady(status(true, true))).toBe(true)
  })
})

describe('appStore', () => {
  it('sets binariesReady from setBinaries', () => {
    useAppStore.getState().setBinaries(status(true, true))
    expect(useAppStore.getState().binariesReady).toBe(true)
  })

  it('upserts jobs by id', () => {
    const job: DownloadJob = {
      id: 'j1',
      url: 'https://x',
      title: 'X',
      kind: 'video',
      state: 'downloading',
      percent: 10,
      speed: null,
      eta: null,
      outputPath: null,
      error: null,
      createdAt: 1
    }
    useAppStore.getState().setJobs([])
    useAppStore.getState().upsertJob(job)
    useAppStore.getState().upsertJob({ ...job, percent: 80 })
    const jobs = useAppStore.getState().jobs
    expect(jobs).toHaveLength(1)
    expect(jobs[0].percent).toBe(80)
  })

  it('patchConfig merges into existing config', () => {
    useAppStore.setState({ config: null })
    useAppStore.getState().patchConfig({ theme: 'dark' })
    expect(useAppStore.getState().config).toBeNull()
  })

  it('appends logs and caps the buffer', () => {
    const entry = (i: number): LogEntry => ({
      level: 'info',
      message: `m${i}`,
      timestamp: i
    })
    useAppStore.getState().setLogs([])
    for (let i = 0; i < 1005; i++) useAppStore.getState().appendLog(entry(i))
    const logs = useAppStore.getState().logs
    expect(logs).toHaveLength(1000)
    expect(logs[logs.length - 1].message).toBe('m1004')
    expect(logs[0].message).toBe('m5')
  })

  it('toggles the cookie hint', () => {
    useAppStore.getState().setCookieHint(true)
    expect(useAppStore.getState().cookieHint).toBe(true)
    useAppStore.getState().setCookieHint(false)
    expect(useAppStore.getState().cookieHint).toBe(false)
  })
})

describe('appendEntries', () => {
  function playlistInfo(entries: PlaylistEntry[]): MediaInfo {
    return {
      id: 'PL1',
      title: 'List',
      uploader: null,
      duration: null,
      thumbnail: null,
      webpageUrl: 'https://x',
      isPlaylist: true,
      playlistCount: 10,
      formats: [],
      entries
    }
  }
  const entry = (id: string): PlaylistEntry => ({
    id,
    title: id,
    url: `https://${id}`,
    duration: null,
    thumbnail: null,
    uploader: null
  })

  it('is a no-op when there is no resolved info', () => {
    useAppStore.setState({ info: null })
    useAppStore.getState().appendEntries([entry('a')])
    expect(useAppStore.getState().info).toBeNull()
  })

  it('appends new entries to the existing playlist', () => {
    useAppStore.setState({ info: playlistInfo([entry('a'), entry('b')]) })
    useAppStore.getState().appendEntries([entry('c'), entry('d')])
    const ids = useAppStore.getState().info!.entries.map((e) => e.id)
    expect(ids).toEqual(['a', 'b', 'c', 'd'])
  })

  it('de-dupes entries that overlap an already-loaded range', () => {
    useAppStore.setState({ info: playlistInfo([entry('a'), entry('b')]) })
    useAppStore.getState().appendEntries([entry('b'), entry('c')])
    const ids = useAppStore.getState().info!.entries.map((e) => e.id)
    expect(ids).toEqual(['a', 'b', 'c'])
  })
})
