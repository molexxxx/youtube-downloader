import { describe, expect, it, vi, beforeEach } from 'vitest'

const { storeInstances, StoreMock } = vi.hoisted(() => {
  const storeInstances: Array<{ store: Record<string, unknown> }> = []
  class StoreMock {
    store: Record<string, unknown>
    constructor(opts: { defaults: Record<string, unknown> }) {
      this.store = { ...opts.defaults }
      storeInstances.push(this)
    }
    set(key: string, value: unknown): void {
      this.store[key] = value
    }
    clear(): void {
      this.store = {}
    }
  }
  return { storeInstances, StoreMock }
})

vi.mock('electron-store', () => ({ default: StoreMock }))
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/home/downloads') }
}))

beforeEach(() => {
  vi.resetModules()
  storeInstances.length = 0
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

  it('resets and restores the downloads path', async () => {
    const { setConfig, resetConfig } = await import('@main/config')
    setConfig({ theme: 'light' })
    const reset = resetConfig()
    expect(reset.theme).toBeUndefined()
    expect(reset.downloadDir).toBe('/home/downloads')
  })
})
