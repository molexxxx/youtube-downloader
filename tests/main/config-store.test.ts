import { describe, expect, it, vi, beforeEach } from 'vitest'

const { storeInstances, StoreMock, seed } = vi.hoisted(() => {
  const storeInstances: Array<{ store: Record<string, unknown> }> = []
  const seed: Record<string, unknown> = {}
  class StoreMock {
    store: Record<string, unknown>
    constructor(opts: { defaults: Record<string, unknown> }) {
      this.store = { ...opts.defaults, ...seed }
      storeInstances.push(this)
    }
    has(key: string): boolean {
      return key in this.store
    }
    get(key: string): unknown {
      return this.store[key]
    }
    set(key: string, value: unknown): void {
      this.store[key] = value
    }
    delete(key: string): void {
      delete this.store[key]
    }
    clear(): void {
      this.store = {}
    }
  }
  return { storeInstances, StoreMock, seed }
})

vi.mock('electron-store', () => ({ default: StoreMock }))
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/home/downloads') }
}))

beforeEach(() => {
  vi.resetModules()
  storeInstances.length = 0
  for (const key of Object.keys(seed)) delete seed[key]
})

describe('config store', () => {
  it('creates a store with defaults and the downloads path', async () => {
    const { getConfig } = await import('@main/config')
    const cfg = getConfig()
    expect(cfg.downloadDir).toBe('/home/downloads')
  })

  it('reuses the same store instance across calls', async () => {
    const { getConfig, setConfig } = await import('@main/config')
    getConfig()
    setConfig({ maxConcurrentDownloads: 5 })
    expect(storeInstances).toHaveLength(1)
  })

  it('persists partial updates', async () => {
    const { setConfig } = await import('@main/config')
    const next = setConfig({ theme: 'light', maxConcurrentDownloads: 4 })
    expect(next.theme).toBe('light')
    expect(next.maxConcurrentDownloads).toBe(4)
  })

  it('moves a renamed setting to its new key once and drops the old key', async () => {
    seed.autoUpdateBinaries = false
    const { getConfig } = await import('@main/config')
    const cfg = getConfig() as unknown as Record<string, unknown>
    expect(cfg.autoUpdateYtdlp).toBe(false)
    expect('autoUpdateBinaries' in cfg).toBe(false)
  })

  it('drops a renamed setting whose stored value has the wrong type', async () => {
    seed.autoUpdateBinaries = 'yes'
    const { getConfig } = await import('@main/config')
    const cfg = getConfig() as unknown as Record<string, unknown>
    expect(cfg.autoUpdateYtdlp).toBe(true)
    expect('autoUpdateBinaries' in cfg).toBe(false)
  })

  it('resets and restores the downloads path', async () => {
    const { setConfig, resetConfig } = await import('@main/config')
    setConfig({ theme: 'light' })
    const reset = resetConfig()
    expect(reset.theme).toBeUndefined()
    expect(reset.downloadDir).toBe('/home/downloads')
  })

  it('keeps finished setup and the chosen tool sources through a reset', async () => {
    const { setConfig, resetConfig } = await import('@main/config')
    setConfig({
      theme: 'light',
      setupComplete: true,
      ytdlpSource: 'system',
      ffmpegSource: 'app'
    })
    const reset = resetConfig()
    expect(reset.theme).toBeUndefined()
    expect(reset.setupComplete).toBe(true)
    expect(reset.ytdlpSource).toBe('system')
    expect(reset.ffmpegSource).toBe('app')
  })
})
