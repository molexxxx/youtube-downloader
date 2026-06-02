import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistoryEntry } from '@shared/types'

const { storeData } = vi.hoisted(() => ({ storeData: { value: [] as HistoryEntry[] } }))

vi.mock('electron-store', () => {
  class FakeStore {
    private data: { entries: HistoryEntry[] }
    constructor() {
      this.data = { entries: storeData.value }
    }
    get(key: 'entries'): HistoryEntry[] {
      return this.data[key]
    }
    set(key: 'entries', value: HistoryEntry[]): void {
      this.data[key] = value
      storeData.value = value
    }
  }
  return { default: FakeStore }
})

import { addHistory, clearHistory, getHistory, removeHistory } from '@main/history'

function entry(id: string, over: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id,
    url: `https://x/${id}`,
    title: id,
    kind: 'video',
    status: 'completed',
    outputPath: null,
    error: null,
    completedAt: Date.now(),
    ...over
  }
}

describe('download history', () => {
  beforeEach(() => {
    storeData.value = []
  })
  afterEach(() => {
    clearHistory()
  })

  it('prepends newest entries', () => {
    addHistory(entry('a'))
    addHistory(entry('b'))
    expect(getHistory().map((e) => e.id)).toEqual(['b', 'a'])
  })

  it('deduplicates by job id', () => {
    addHistory(entry('a', { title: 'first' }))
    addHistory(entry('a', { title: 'second' }))
    const all = getHistory()
    expect(all).toHaveLength(1)
    expect(all[0].title).toBe('second')
  })

  it('removes and clears entries', () => {
    addHistory(entry('a'))
    addHistory(entry('b'))
    expect(removeHistory('a').map((e) => e.id)).toEqual(['b'])
    expect(clearHistory()).toEqual([])
    expect(getHistory()).toEqual([])
  })
})
