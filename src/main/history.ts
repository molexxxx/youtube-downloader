import ElectronStore from 'electron-store'
import type { HistoryEntry } from '@shared/types'

// electron-store v11 is ESM-only; under CJS interop unwrap the default export so
// the constructor is always callable (mirrors config.ts).
const StoreCtor = (
  (ElectronStore as unknown as { default?: typeof ElectronStore }).default ?? ElectronStore
) as typeof ElectronStore

interface HistoryShape {
  entries: HistoryEntry[]
}

const MAX_ENTRIES = 200

type Listener = (entries: HistoryEntry[]) => void

let store: ElectronStore<HistoryShape> | null = null
const listeners = new Set<Listener>()

function getStore(): ElectronStore<HistoryShape> {
  if (!store) {
    store = new StoreCtor<HistoryShape>({ name: 'history', defaults: { entries: [] } })
  }
  return store
}

function notify(entries: HistoryEntry[]): void {
  for (const listener of listeners) listener(entries)
}

export function getHistory(): HistoryEntry[] {
  return getStore().get('entries')
}

export function addHistory(entry: HistoryEntry): HistoryEntry[] {
  const s = getStore()
  // Newest first, drop any prior record for the same job id, cap the list.
  const next = [entry, ...s.get('entries').filter((e) => e.id !== entry.id)].slice(
    0,
    MAX_ENTRIES
  )
  s.set('entries', next)
  notify(next)
  return next
}

export function removeHistory(id: string): HistoryEntry[] {
  const s = getStore()
  const next = s.get('entries').filter((e) => e.id !== id)
  s.set('entries', next)
  notify(next)
  return next
}

export function clearHistory(): HistoryEntry[] {
  getStore().set('entries', [])
  notify([])
  return []
}

export function subscribeHistory(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
