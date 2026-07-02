import { describe, expect, it, beforeEach } from 'vitest'
import { useAppStore } from '@renderer/stores/appStore'
import type {
  AppConfig,
  AppUpdateStatus,
  BootstrapProgress,
  DownloadJob,
  HistoryEntry,
  MediaInfo,
  PlaylistEntry
} from '@shared/types'

const baseConfig = (): AppConfig =>
  ({
    theme: 'dark',
    downloadDir: '/d',
    notifications: true,
    closeToTray: true,
    autoUpdateApp: true,
    cookiesFromBrowser: null
  }) as AppConfig

const job = (id: string, state: DownloadJob['state']): DownloadJob =>
  ({
    id,
    url: 'https://x',
    title: id,
    kind: 'video',
    state,
    percent: 0,
    speed: null,
    eta: null,
    outputPath: null,
    error: null,
    createdAt: 1
  }) as DownloadJob

beforeEach(() => {
  useAppStore.setState({
    config: null,
    bootstrap: null,
    view: 'downloads',
    info: null,
    searchResults: [],
    resolving: false,
    jobs: [],
    history: [],
    appUpdate: null,
    error: null
  })
})

describe('appStore additional setters', () => {
  it('setConfig stores the config', () => {
    useAppStore.getState().setConfig(baseConfig())
    expect(useAppStore.getState().config?.theme).toBe('dark')
  })

  it('patchConfig merges into an existing config', () => {
    useAppStore.getState().setConfig(baseConfig())
    useAppStore.getState().patchConfig({ theme: 'light' })
    expect(useAppStore.getState().config?.theme).toBe('light')
  })

  it('setBootstrap stores progress', () => {
    const progress = { stage: 'ffmpeg', percent: 30 } as unknown as BootstrapProgress
    useAppStore.getState().setBootstrap(progress)
    expect(useAppStore.getState().bootstrap).toBe(progress)
  })

  it('setView switches the active view', () => {
    useAppStore.getState().setView('settings')
    expect(useAppStore.getState().view).toBe('settings')
  })

  it('setInfo and setSearchResults store resolver output', () => {
    const info = { id: 'v', title: 'V', entries: [] } as unknown as MediaInfo
    const results = [{ id: 'a', title: 'A' }] as unknown as PlaylistEntry[]
    useAppStore.getState().setInfo(info)
    useAppStore.getState().setSearchResults(results)
    expect(useAppStore.getState().info).toBe(info)
    expect(useAppStore.getState().searchResults).toBe(results)
  })

  it('setResolving toggles the resolving flag', () => {
    useAppStore.getState().setResolving(true)
    expect(useAppStore.getState().resolving).toBe(true)
  })

  it('clearFinishedJobs keeps only active jobs', () => {
    useAppStore
      .getState()
      .setJobs([
        job('a', 'downloading'),
        job('b', 'completed'),
        job('c', 'error'),
        job('d', 'cancelled'),
        job('e', 'queued')
      ])
    useAppStore.getState().clearFinishedJobs()
    expect(useAppStore.getState().jobs.map((j) => j.id)).toEqual(['a', 'e'])
  })

  it('setHistory stores history entries', () => {
    const history = [{ id: 'h1' }] as unknown as HistoryEntry[]
    useAppStore.getState().setHistory(history)
    expect(useAppStore.getState().history).toBe(history)
  })

  it('setAppUpdate stores update status', () => {
    const status = { state: 'available', version: '2.0.0' } as unknown as AppUpdateStatus
    useAppStore.getState().setAppUpdate(status)
    expect(useAppStore.getState().appUpdate).toBe(status)
  })

  it('setError stores and clears errors', () => {
    useAppStore.getState().setError('boom')
    expect(useAppStore.getState().error).toBe('boom')
    useAppStore.getState().setError(null)
    expect(useAppStore.getState().error).toBeNull()
  })
})
