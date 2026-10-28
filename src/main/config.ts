import { app } from 'electron'
import ElectronStore from 'electron-store'
import { DEFAULT_CONFIG, type AppConfig } from '@shared/types'

// electron-store v11 is ESM-only; under CJS interop the class can arrive wrapped
// as `{ default: ElectronStore }`. Unwrap so the constructor is always callable.
const StoreCtor = ((ElectronStore as unknown as { default?: typeof ElectronStore })
  .default ?? ElectronStore) as typeof ElectronStore

let store: ElectronStore<AppConfig> | null = null

/** Settings a release renamed: the stored value moves to the new key once, then the old key is dropped. */
const RENAMED: ReadonlyArray<[string, keyof AppConfig]> = [
  ['autoUpdateBinaries', 'autoUpdateYtdlp']
]

function getStore(): ElectronStore<AppConfig> {
  if (!store) {
    store = new StoreCtor<AppConfig>({
      name: 'config',
      defaults: {
        ...DEFAULT_CONFIG,
        downloadDir: app.getPath('downloads')
      }
    })
    migrateRenamed(store)
  }
  return store
}

function migrateRenamed(s: ElectronStore<AppConfig>): void {
  const raw = s as unknown as {
    has(key: string): boolean
    get(key: string): unknown
    delete(key: string): void
  }
  for (const [from, to] of RENAMED) {
    if (!raw.has(from)) continue
    const value = raw.get(from)
    if (typeof value === typeof DEFAULT_CONFIG[to]) s.set(to, value as never)
    raw.delete(from)
  }
}

export function getConfig(): AppConfig {
  return getStore().store
}

export function setConfig(partial: Partial<AppConfig>): AppConfig {
  const s = getStore()
  for (const [key, value] of Object.entries(partial)) {
    s.set(key as keyof AppConfig, value as never)
  }
  return s.store
}

/** How this install's tools were set up. Resetting preferences keeps them, so setup never runs again. */
const INSTALL_STATE: ReadonlyArray<keyof AppConfig> = [
  'setupComplete',
  'ytdlpSource',
  'ffmpegSource'
]

export function resetConfig(): AppConfig {
  const s = getStore()
  const kept = INSTALL_STATE.map((key) => [key, s.get(key)] as const)
  s.clear()
  s.set('downloadDir', app.getPath('downloads'))
  for (const [key, value] of kept) s.set(key, value as never)
  return s.store
}

/**
 * Merge a stored config with defaults. Exported for unit testing the merge logic
 * independently of electron-store.
 */
export function mergeConfig(
  stored: Partial<AppConfig>,
  defaults: AppConfig = DEFAULT_CONFIG
): AppConfig {
  return { ...defaults, ...stored }
}
