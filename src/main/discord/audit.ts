import { randomUUID } from 'crypto'
import ElectronStore from 'electron-store'
import type { AuditAction, AuditEntry, TrackRequester } from '@shared/types'

// electron-store v11 is ESM-only; unwrap the default export (mirrors history.ts).
const StoreCtor = (
  (ElectronStore as unknown as { default?: typeof ElectronStore }).default ?? ElectronStore
) as typeof ElectronStore

interface AuditShape {
  entries: AuditEntry[]
}

const MAX_ENTRIES = 500

type Listener = (entries: AuditEntry[]) => void

let store: ElectronStore<AuditShape> | null = null
const listeners = new Set<Listener>()

function getStore(): ElectronStore<AuditShape> {
  if (!store) {
    store = new StoreCtor<AuditShape>({ name: 'discord-audit', defaults: { entries: [] } })
  }
  return store
}

function notify(entries: AuditEntry[]): void {
  for (const listener of listeners) listener(entries)
}

/** All audit entries, newest first; optionally filtered to one guild. */
export function getAudit(guildId?: string): AuditEntry[] {
  const all = getStore().get('entries')
  return guildId ? all.filter((e) => e.guildId === guildId) : all
}

export function addAudit(input: {
  guildId: string
  actor: TrackRequester
  action: AuditAction
  detail: string
}): AuditEntry {
  const entry: AuditEntry = { id: randomUUID(), ts: Date.now(), ...input }
  const next = [entry, ...getStore().get('entries')].slice(0, MAX_ENTRIES)
  getStore().set('entries', next)
  notify(next)
  return entry
}

export function clearAudit(): AuditEntry[] {
  getStore().set('entries', [])
  notify([])
  return []
}

export function subscribeAudit(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
