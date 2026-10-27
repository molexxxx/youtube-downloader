import { describe, expect, it, vi, beforeEach } from 'vitest'
import { IPC } from '@shared/types'

const {
  handlers,
  getConfigMock,
  setConfigMock,
  resetConfigMock,
  applyThemeMock,
  setAutoDownloadMock,
  settingsChangedMock,
  sourcesChangedMock
} = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  getConfigMock: vi.fn(() => ({ theme: 'dark' })),
  setConfigMock: vi.fn((partial: Record<string, unknown>) => ({
    theme: 'light',
    autoUpdateApp: true,
    ...partial
  })),
  resetConfigMock: vi.fn(() => ({ theme: 'system', autoUpdateApp: true })),
  applyThemeMock: vi.fn(),
  setAutoDownloadMock: vi.fn(),
  settingsChangedMock: vi.fn(),
  sourcesChangedMock: vi.fn()
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
vi.mock('@main/updater', () => ({ setAutoDownload: setAutoDownloadMock }))
vi.mock('@main/binaries', () => ({
  ytdlpUpdater: () => ({ settingsChanged: settingsChangedMock }),
  binarySourcesChanged: sourcesChangedMock
}))

import { registerConfigIPC } from '@main/ipc/config'

beforeEach(() => {
  handlers.clear()
  getConfigMock.mockClear()
  setConfigMock.mockClear()
  resetConfigMock.mockClear()
  applyThemeMock.mockClear()
  setAutoDownloadMock.mockClear()
  settingsChangedMock.mockClear()
  sourcesChangedMock.mockClear()
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

  it('applies the update settings live, and only when they change', () => {
    handlers.get(IPC.config.set)!({}, { notifications: false })
    expect(setAutoDownloadMock).not.toHaveBeenCalled()
    expect(settingsChangedMock).not.toHaveBeenCalled()
    handlers.get(IPC.config.set)!({}, { autoUpdateApp: false })
    expect(setAutoDownloadMock).toHaveBeenCalledWith(false)
    handlers.get(IPC.config.set)!({}, { autoUpdateYtdlp: false })
    expect(settingsChangedMock).toHaveBeenCalledTimes(1)
    handlers.get(IPC.config.set)!({}, { ffmpegSource: 'system' })
    expect(sourcesChangedMock).toHaveBeenCalledTimes(1)
  })

  it('reset restores defaults and re-applies the theme and update settings', () => {
    const result = handlers.get(IPC.config.reset)!({})
    expect(resetConfigMock).toHaveBeenCalled()
    expect(applyThemeMock).toHaveBeenCalledWith('system')
    expect(setAutoDownloadMock).toHaveBeenCalledWith(true)
    expect(sourcesChangedMock).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ theme: 'system', autoUpdateApp: true })
  })
})
