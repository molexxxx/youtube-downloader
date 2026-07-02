import { app } from 'electron'
import ElectronStore from 'electron-store'
import { DEFAULT_CONFIG, type AppConfig } from '@shared/types'

// electron-store v11 is ESM-only; under CJS interop the class can arrive wrapped
// as `{ default: ElectronStore }`. Unwrap so the constructor is always callable.
const StoreCtor = ((ElectronStore as unknown as { default?: typeof ElectronStore })
  .default ?? ElectronStore) as typeof ElectronStore

let store: ElectronStore<AppConfig> | null = null

function getStore(): ElectronStore<AppConfig> {
  if (!store) {
    store = new StoreCtor<AppConfig>({
      name: 'config',
      defaults: {
        ...DEFAULT_CONFIG,
        downloadDir: app.getPath('downloads')
      }
    })
  }
  return store
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

export function resetConfig(): AppConfig {
  const s = getStore()
  s.clear()
  s.set('downloadDir', app.getPath('downloads'))
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
