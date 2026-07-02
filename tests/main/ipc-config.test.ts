import { describe, expect, it, vi, beforeEach } from 'vitest'
import { IPC } from '@shared/types'

const { handlers, getConfigMock, setConfigMock, resetConfigMock, applyThemeMock } =
  vi.hoisted(() => ({
    handlers: new Map<string, (...args: unknown[]) => unknown>(),
    getConfigMock: vi.fn(() => ({ theme: 'dark' })),
    setConfigMock: vi.fn((partial: Record<string, unknown>) => ({
      theme: 'light',
      ...partial
    })),
    resetConfigMock: vi.fn(() => ({ theme: 'system' })),
    applyThemeMock: vi.fn()
  }))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }
  }
}))
vi.mock('@main/config', () => ({
  getConfig: getConfigMock,
  setConfig: setConfigMock,
  resetConfig: resetConfigMock
}))
vi.mock('@main/theme', () => ({ applyTheme: applyThemeMock }))

import { registerConfigIPC } from '@main/ipc/config'

beforeEach(() => {
  handlers.clear()
  getConfigMock.mockClear()
  setConfigMock.mockClear()
  resetConfigMock.mockClear()
  applyThemeMock.mockClear()
  registerConfigIPC()
})

describe('registerConfigIPC', () => {
  it('registers get, set, and reset handlers', () => {
    expect(handlers.has(IPC.config.get)).toBe(true)
    expect(handlers.has(IPC.config.set)).toBe(true)
    expect(handlers.has(IPC.config.reset)).toBe(true)
  })

  it('get returns the current config', () => {
    expect(handlers.get(IPC.config.get)!({})).toEqual({ theme: 'dark' })
  })

  it('set persists the partial and skips applyTheme when theme is absent', () => {
    const result = handlers.get(IPC.config.set)!({}, { notifications: false })
    expect(setConfigMock).toHaveBeenCalledWith({ notifications: false })
    expect(applyThemeMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({ notifications: false })
  })

  it('set applies the theme when theme changes', () => {
    handlers.get(IPC.config.set)!({}, { theme: 'light' })
    expect(applyThemeMock).toHaveBeenCalledWith('light')
  })

  it('reset restores defaults and re-applies the theme', () => {
    const result = handlers.get(IPC.config.reset)!({})
    expect(resetConfigMock).toHaveBeenCalled()
    expect(applyThemeMock).toHaveBeenCalledWith('system')
    expect(result).toEqual({ theme: 'system' })
  })
})
