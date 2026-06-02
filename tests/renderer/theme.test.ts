import { describe, expect, it, beforeEach, vi } from 'vitest'
import { applyTheme } from '@renderer/lib/theme'

let listeners: Array<() => void>
let matches: boolean

beforeEach(() => {
  listeners = []
  matches = false
  document.documentElement.className = ''
  vi.stubGlobal('matchMedia', (_query: string) => ({
    get matches() {
      return matches
    },
    addEventListener: (_event: string, cb: () => void) => listeners.push(cb),
    removeEventListener: (_event: string, cb: () => void) => {
      listeners = listeners.filter((l) => l !== cb)
    }
  }))
})

describe('applyTheme', () => {
  it('applies the light class for an explicit light theme', () => {
    applyTheme('light')
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('applies the dark class for an explicit dark theme', () => {
    applyTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
  })

  it('explicit themes attach no system listener and return a noop cleanup', () => {
    const cleanup = applyTheme('dark')
    expect(listeners).toHaveLength(0)
    expect(() => cleanup()).not.toThrow()
  })

  it('system theme resolves from matchMedia and reacts to changes', () => {
    matches = true
    const cleanup = applyTheme('system')
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(listeners).toHaveLength(1)

    matches = false
    listeners[0]()
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    cleanup()
    expect(listeners).toHaveLength(0)
  })
})
