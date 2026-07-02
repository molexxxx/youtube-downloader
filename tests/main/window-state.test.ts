import { beforeEach, describe, expect, it, vi } from 'vitest'

const { storeData, getAllDisplaysMock } = vi.hoisted(() => ({
  storeData: { bounds: null as unknown, maximized: false },
  getAllDisplaysMock: vi.fn(() => [
    { workArea: { x: 0, y: 0, width: 2560, height: 1400 } }
  ])
}))

vi.mock('electron', () => ({
  screen: { getAllDisplays: getAllDisplaysMock }
}))

vi.mock('electron-store', () => {
  class MockElectronStore {
    get store() {
      return { ...storeData }
    }
    set(key: 'bounds' | 'maximized', value: never) {
      storeData[key] = value
    }
  }
  return { default: MockElectronStore }
})

import {
  boundsVisible,
  DEFAULT_WINDOW_SIZE,
  loadWindowState,
  MIN_WINDOW_SIZE,
  trackWindowState
} from '@main/window-state'

describe('boundsVisible', () => {
  const displays = [{ x: 0, y: 0, width: 1920, height: 1080 }]

  it('accepts bounds centered on a display', () => {
    expect(boundsVisible({ x: 100, y: 100, width: 800, height: 600 }, displays)).toBe(
      true
    )
  })

  it('rejects bounds whose center is off every display', () => {
    expect(boundsVisible({ x: 5000, y: 100, width: 800, height: 600 }, displays)).toBe(
      false
    )
  })
})

describe('window state persistence', () => {
  beforeEach(() => {
    storeData.bounds = null
    storeData.maximized = false
    getAllDisplaysMock.mockClear()
  })

  it('exposes a 1600x900 default and a 1280x720 minimum', () => {
    expect(DEFAULT_WINDOW_SIZE).toEqual({ width: 1600, height: 900 })
    expect(MIN_WINDOW_SIZE).toEqual({ width: 1280, height: 720 })
  })

  it('returns null bounds when nothing was saved', () => {
    expect(loadWindowState()).toEqual({ bounds: null, maximized: false })
  })

  it('returns saved bounds when they are still on-screen', () => {
    storeData.bounds = { x: 50, y: 50, width: 1600, height: 900 }
    storeData.maximized = true
    expect(loadWindowState()).toEqual({
      bounds: { x: 50, y: 50, width: 1600, height: 900 },
      maximized: true
    })
  })

  it('discards saved bounds that are off-screen', () => {
    storeData.bounds = { x: -9000, y: -9000, width: 1600, height: 900 }
    expect(loadWindowState().bounds).toBeNull()
  })

  it('saves normal bounds on close', () => {
    const handlers = new Map<string, () => void>()
    const window = {
      on: (event: string, cb: () => void) => handlers.set(event, cb),
      isDestroyed: () => false,
      isMinimized: () => false,
      isMaximized: () => false,
      getNormalBounds: () => ({ x: 10, y: 20, width: 1700, height: 950 })
    }
    trackWindowState(window as never)

    handlers.get('close')!()

    expect(storeData.bounds).toEqual({ x: 10, y: 20, width: 1700, height: 950 })
    expect(storeData.maximized).toBe(false)
  })

  it('keeps the last normal bounds when closing maximized', () => {
    storeData.bounds = { x: 1, y: 2, width: 1600, height: 900 }
    const handlers = new Map<string, () => void>()
    const window = {
      on: (event: string, cb: () => void) => handlers.set(event, cb),
      isDestroyed: () => false,
      isMinimized: () => false,
      isMaximized: () => true,
      getNormalBounds: () => ({ x: 99, y: 99, width: 1, height: 1 })
    }
    trackWindowState(window as never)

    handlers.get('close')!()

    expect(storeData.maximized).toBe(true)
    expect(storeData.bounds).toEqual({ x: 1, y: 2, width: 1600, height: 900 })
  })
})
