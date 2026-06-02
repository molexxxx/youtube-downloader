import { describe, expect, it, vi, beforeEach } from 'vitest'
import { IPC } from '@shared/types'

const {
  handlers,
  setConfigMock,
  getCookieInfoMock,
  refreshCookiesMock,
  clearCookiesMock
} = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  setConfigMock: vi.fn(),
  getCookieInfoMock: vi.fn(() => ({ browser: null, detected: [] })),
  refreshCookiesMock: vi.fn(() => Promise.resolve({ browser: 'chrome', detected: [] })),
  clearCookiesMock: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }
  }
}))
vi.mock('@main/config', () => ({ setConfig: setConfigMock }))
vi.mock('@main/ytdlp/cookies', () => ({
  getCookieInfo: getCookieInfoMock,
  refreshCookies: refreshCookiesMock,
  clearCookies: clearCookiesMock
}))

import { registerCookiesIPC } from '@main/ipc/cookies'

beforeEach(() => {
  handlers.clear()
  setConfigMock.mockClear()
  getCookieInfoMock.mockClear()
  refreshCookiesMock.mockClear()
  clearCookiesMock.mockClear()
  registerCookiesIPC()
})

describe('registerCookiesIPC', () => {
  it('registers info, set, refresh, and clear handlers', () => {
    expect(handlers.has(IPC.cookies.info)).toBe(true)
    expect(handlers.has(IPC.cookies.set)).toBe(true)
    expect(handlers.has(IPC.cookies.refresh)).toBe(true)
    expect(handlers.has(IPC.cookies.clear)).toBe(true)
  })

  it('info returns the cookie info', () => {
    expect(handlers.get(IPC.cookies.info)!({})).toEqual({ browser: null, detected: [] })
  })

  it('set with a browser stores it and refreshes', async () => {
    const result = await handlers.get(IPC.cookies.set)!({}, 'chrome')
    expect(setConfigMock).toHaveBeenCalledWith({ cookiesFromBrowser: 'chrome' })
    expect(refreshCookiesMock).toHaveBeenCalled()
    expect(result).toEqual({ browser: 'chrome', detected: [] })
  })

  it('set with an empty browser clears the cache and config', async () => {
    const result = await handlers.get(IPC.cookies.set)!({}, '')
    expect(setConfigMock).toHaveBeenCalledWith({ cookiesFromBrowser: null })
    expect(clearCookiesMock).toHaveBeenCalled()
    expect(refreshCookiesMock).not.toHaveBeenCalled()
    expect(result).toEqual({ browser: null, detected: [] })
  })

  it('refresh re-exports the cookies', () => {
    handlers.get(IPC.cookies.refresh)!({})
    expect(refreshCookiesMock).toHaveBeenCalled()
  })

  it('clear wipes config and cache', () => {
    handlers.get(IPC.cookies.clear)!({})
    expect(setConfigMock).toHaveBeenCalledWith({ cookiesFromBrowser: null })
    expect(clearCookiesMock).toHaveBeenCalled()
  })
})
