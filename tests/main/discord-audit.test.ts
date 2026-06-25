import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuditEntry, TrackRequester } from '@shared/types'

const { storeData } = vi.hoisted(() => ({ storeData: { value: [] as AuditEntry[] } }))

vi.mock('electron-store', () => {
  class FakeStore {
    private data: { entries: AuditEntry[] }
    constructor() {
      this.data = { entries: storeData.value }
    }
    get(key: 'entries'): AuditEntry[] {
      return this.data[key]
    }
    set(key: 'entries', value: AuditEntry[]): void {
      this.data[key] = value
      storeData.value = value
    }
  }
  return { default: FakeStore }
})

import { addAudit, clearAudit, getAudit, subscribeAudit } from '@main/discord/audit'

const ACTOR: TrackRequester = { source: 'ui', userId: null, username: 'You' }

describe('discord audit log', () => {
  beforeEach(() => {
    storeData.value = []
  })
  afterEach(() => {
    clearAudit()
  })

  it('records newest entries first', () => {
    addAudit({ guildId: 'g1', actor: ACTOR, action: 'play', detail: 'first' })
    addAudit({ guildId: 'g1', actor: ACTOR, action: 'skip', detail: 'second' })
    expect(getAudit().map((e) => e.detail)).toEqual(['second', 'first'])
  })

  it('filters by guild', () => {
    addAudit({ guildId: 'g1', actor: ACTOR, action: 'play', detail: 'a' })
    addAudit({ guildId: 'g2', actor: ACTOR, action: 'play', detail: 'b' })
    expect(getAudit('g1').map((e) => e.detail)).toEqual(['a'])
    expect(getAudit('g2').map((e) => e.detail)).toEqual(['b'])
  })

  it('caps the log at 500 entries', () => {
    for (let i = 0; i < 520; i++) {
      addAudit({ guildId: 'g1', actor: ACTOR, action: 'enqueue', detail: String(i) })
    }
    const all = getAudit()
    expect(all).toHaveLength(500)
    // Newest first; the most recent addition is at the top.
    expect(all[0].detail).toBe('519')
  })

  it('notifies subscribers on change', () => {
    const seen: number[] = []
    const off = subscribeAudit((entries) => seen.push(entries.length))
    addAudit({ guildId: 'g1', actor: ACTOR, action: 'play', detail: 'x' })
    off()
    addAudit({ guildId: 'g1', actor: ACTOR, action: 'play', detail: 'y' })
    expect(seen).toEqual([1])
  })
})
