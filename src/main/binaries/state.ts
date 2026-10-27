import ElectronStore from 'electron-store'

// electron-store v11 is ESM-only; under CJS interop unwrap the default export so
// the constructor is always callable (mirrors config.ts).
const StoreCtor = ((ElectronStore as unknown as { default?: typeof ElectronStore })
  .default ?? ElectronStore) as typeof ElectronStore

interface BinariesShape {
  ytdlp: unknown
  selfTests: Record<string, unknown>
}

let store: ElectronStore<BinariesShape> | null = null

function getStore(): ElectronStore<BinariesShape> {
  if (!store) {
    store = new StoreCtor<BinariesShape>({
      name: 'binaries',
      defaults: { ytdlp: null, selfTests: {} }
    })
  }
  return store
}

/** The last self-test stored for a binary, keyed by `ytdlp` or `ffmpeg`; the caller validates the shape. */
export function readSelfTest(which: string): unknown {
  return getStore().get('selfTests')[which] ?? null
}

export function writeSelfTest(which: string, value: unknown): void {
  getStore().set('selfTests', { ...getStore().get('selfTests'), [which]: value })
}

/** What the yt-dlp updater last recorded; the updater validates the shape. */
export function readYtdlpState(): unknown {
  return getStore().get('ytdlp')
}

export function writeYtdlpState(value: unknown): void {
  getStore().set('ytdlp', value)
}
