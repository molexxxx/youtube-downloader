import { screen, type BrowserWindow, type Rectangle } from 'electron'
import ElectronStore from 'electron-store'

// electron-store v11 is ESM-only; under CJS interop the class can arrive wrapped
// as `{ default: ElectronStore }`. Unwrap so the constructor is always callable.
const StoreCtor = ((ElectronStore as unknown as { default?: typeof ElectronStore })
  .default ?? ElectronStore) as typeof ElectronStore

interface WindowStateShape {
  bounds: Rectangle | null
  maximized: boolean
  miniBounds: Rectangle | null
}

export const DEFAULT_WINDOW_SIZE = { width: 1600, height: 900 }
export const MIN_WINDOW_SIZE = { width: 1280, height: 720 }

export const DEFAULT_MINI_WINDOW_SIZE = { width: 380, height: 560 }
export const MIN_MINI_WINDOW_SIZE = { width: 320, height: 420 }

const SAVE_DEBOUNCE_MS = 500

let store: ElectronStore<WindowStateShape> | null = null

function getStore(): ElectronStore<WindowStateShape> {
  if (!store) {
    store = new StoreCtor<WindowStateShape>({
      name: 'window-state',
      defaults: { bounds: null, maximized: false, miniBounds: null }
    })
  }
  return store
}

/**
 * Whether saved bounds are still (mostly) on a connected display, so a window
 * is never restored off-screen after a monitor change.
 */
export function boundsVisible(bounds: Rectangle, displays: Rectangle[]): boolean {
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  return displays.some(
    (d) =>
      centerX >= d.x &&
      centerX <= d.x + d.width &&
      centerY >= d.y &&
      centerY <= d.y + d.height
  )
}

/** Saved-and-valid window bounds, or null to use defaults. */
export function loadWindowState(): { bounds: Rectangle | null; maximized: boolean } {
  const saved = getStore().store
  if (!saved.bounds) return { bounds: null, maximized: saved.maximized }
  const displays = screen.getAllDisplays().map((d) => d.workArea)
  return {
    bounds: boundsVisible(saved.bounds, displays) ? saved.bounds : null,
    maximized: saved.maximized
  }
}

/** Persist the window's bounds on move/resize (debounced) and close. */
export function trackWindowState(window: BrowserWindow): void {
  let timer: ReturnType<typeof setTimeout> | null = null

  const save = (): void => {
    if (window.isDestroyed() || window.isMinimized()) return
    const s = getStore()
    s.set('maximized', window.isMaximized())
    if (!window.isMaximized()) {
      s.set('bounds', window.getNormalBounds())
    }
  }

  const debouncedSave = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(save, SAVE_DEBOUNCE_MS)
  }

  window.on('resize', debouncedSave)
  window.on('move', debouncedSave)
  window.on('maximize', debouncedSave)
  window.on('unmaximize', debouncedSave)
  window.on('close', () => {
    if (timer) clearTimeout(timer)
    save()
  })
}

/** Saved-and-valid quick-actions window bounds, or null to use defaults. */
export function loadMiniWindowBounds(): Rectangle | null {
  const saved = getStore().get('miniBounds')
  if (!saved) return null
  const displays = screen.getAllDisplays().map((d) => d.workArea)
  return boundsVisible(saved, displays) ? saved : null
}

/** Persist the quick-actions window's bounds on move/resize (debounced) and close. */
export function trackMiniWindowState(window: BrowserWindow): void {
  let timer: ReturnType<typeof setTimeout> | null = null

  const save = (): void => {
    if (window.isDestroyed() || window.isMinimized()) return
    getStore().set('miniBounds', window.getNormalBounds())
  }

  const debouncedSave = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(save, SAVE_DEBOUNCE_MS)
  }

  window.on('resize', debouncedSave)
  window.on('move', debouncedSave)
  window.on('close', () => {
    if (timer) clearTimeout(timer)
    save()
  })
}
