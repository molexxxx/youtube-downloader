import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/nonexistent' } }))

import { formatPart } from '@main/logger'

describe('formatPart', () => {
  it('prints an Error by its message instead of as an empty object', () => {
    expect(formatPart(new Error('spawn ENOENT'))).toBe('spawn ENOENT')
    expect(formatPart(Object.assign(new Error(''), { name: 'AbortError' }))).toBe(
      'AbortError'
    )
  })

  it('keeps strings as they are and serializes other values', () => {
    expect(formatPart('plain')).toBe('plain')
    expect(formatPart({ a: 1 })).toBe('{"a":1}')
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(formatPart(circular)).toBe('[object Object]')
  })
})
