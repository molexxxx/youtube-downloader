import { beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'path'
import type { AppConfig } from '@shared/types'

const { engineMock, fsState } = vi.hoisted(() => ({
  engineMock: vi.fn(() => Promise.resolve()),
  fsState: {
    exists: false,
    size: 0,
    mtimeMs: 0
  }
}))

vi.mock('electron', () => ({ app: { getPath: () => '/userdata' } }))
vi.mock('youtube-dl-exec', () => ({ create: () => engineMock }))
vi.mock('@main/binaries/ffmpeg-binary', () => ({ ffmpegDir: () => '/bin' }))
vi.mock('@main/binaries/ytdlp-binary', () => ({ ytdlpPath: () => '/bin/yt-dlp' }))
vi.mock('fs', () => ({
  existsSync: vi.fn(() => fsState.exists),
  statSync: vi.fn(() => {
    if (!fsState.exists) throw new Error('no file')
    return { size: fsState.size, mtimeMs: fsState.mtimeMs }
  }),
  unlinkSync: vi.fn(() => {
    fsState.exists = false
  })
}))
vi.mock('@main/config', () => ({ getConfig: () => baseConfig }))

let baseConfig: AppConfig

import {
  cookieArgs,
  cookieFlags,
  clearCookies,
  getCookieInfo
} from '@main/ytdlp/cookies'

function makeConfig(over: Partial<AppConfig>): AppConfig {
  return { cookiesFromBrowser: null, ...over } as AppConfig
}

const DAY = 24 * 60 * 60 * 1000
const COOKIE_FILE = join('/userdata', 'cookies.txt')

describe('cookie cache branches', () => {
  beforeEach(() => {
    engineMock.mockClear()
    fsState.exists = false
    fsState.size = 0
    fsState.mtimeMs = 0
    baseConfig = makeConfig({})
  })

  it('uses the cached file when a fresh cache exists', () => {
    fsState.exists = true
    fsState.size = 100
    fsState.mtimeMs = Date.now() - DAY // 1 day old → fresh

    expect(cookieArgs(makeConfig({ cookiesFromBrowser: 'chrome' }))).toEqual([
      '--cookies',
      COOKIE_FILE
    ])
    expect(cookieFlags(makeConfig({ cookiesFromBrowser: 'chrome' }))).toEqual({
      cookies: COOKIE_FILE
    })
  })

  it('still serves the cached file when it is stale (refresh happens in background)', () => {
    fsState.exists = true
    fsState.size = 100
    fsState.mtimeMs = Date.now() - 30 * DAY // 30 days old → stale

    expect(cookieArgs(makeConfig({ cookiesFromBrowser: 'chrome' }))).toEqual([
      '--cookies',
      COOKIE_FILE
    ])
  })

  it('treats an empty cached file as no cache and downloads cookie-free', () => {
    fsState.exists = true
    fsState.size = 0

    // No usable cache yet: cookie args are empty so a locked/running browser
    // never blocks the download. The export is attempted in the background.
    expect(cookieArgs(makeConfig({ cookiesFromBrowser: 'chrome' }))).toEqual([])
  })

  it('reports cache state and detected browsers via getCookieInfo', () => {
    fsState.exists = true
    fsState.size = 100
    fsState.mtimeMs = Date.now() - DAY

    const info = getCookieInfo(makeConfig({ cookiesFromBrowser: 'chrome' }))
    expect(info.browser).toBe('chrome')
    expect(info.cached).toBe(true)
    expect(info.ageMs).not.toBeNull()
    expect(Array.isArray(info.detected)).toBe(true)
  })

  it('reports an uncached state when no file exists', () => {
    const info = getCookieInfo(makeConfig({ cookiesFromBrowser: null }))
    expect(info.browser).toBe('')
    expect(info.cached).toBe(false)
    expect(info.ageMs).toBeNull()
  })

  it('clearCookies removes the cached file without throwing', () => {
    fsState.exists = true
    expect(() => clearCookies()).not.toThrow()
    expect(fsState.exists).toBe(false)
  })
})
