import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppConfig } from '@shared/types'

const { engineMock } = vi.hoisted(() => ({ engineMock: vi.fn(() => Promise.resolve()) }))

vi.mock('electron', () => ({ app: { getPath: () => '/userdata' } }))
vi.mock('youtube-dl-exec', () => ({ create: () => engineMock }))
vi.mock('@main/binaries/ffmpeg-binary', () => ({ ffmpegDir: () => '/bin' }))
vi.mock('@main/binaries/ytdlp-binary', () => ({ ytdlpPath: () => '/bin/yt-dlp' }))
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  statSync: vi.fn(() => {
    throw new Error('no file')
  }),
  unlinkSync: vi.fn()
}))
vi.mock('@main/config', () => ({ getConfig: () => baseConfig }))

let baseConfig: AppConfig

import { cookieArgs, cookieFlags, cookiesEnabled, isAuthRequiredError } from '@main/ytdlp/cookies'

function makeConfig(over: Partial<AppConfig>): AppConfig {
  return { cookiesFromBrowser: null, ...over } as AppConfig
}

describe('cookie helpers', () => {
  beforeEach(() => {
    engineMock.mockClear()
    baseConfig = makeConfig({})
  })

  it('returns no args when cookies are disabled', () => {
    expect(cookieArgs(makeConfig({ cookiesFromBrowser: null }))).toEqual([])
    expect(cookieFlags(makeConfig({ cookiesFromBrowser: null }))).toEqual({})
    expect(engineMock).not.toHaveBeenCalled()
  })

  it('downloads cookie-free when no cache exists yet', () => {
    // A live browser read locks against a running Chromium browser, so when no
    // cache is present we omit cookies entirely and export in the background.
    expect(cookieArgs(makeConfig({ cookiesFromBrowser: 'chrome' }))).toEqual([])
    expect(cookieFlags(makeConfig({ cookiesFromBrowser: 'chrome' }))).toEqual({})
  })
})

describe('cookiesEnabled', () => {
  it('is false when no browser is configured', () => {
    expect(cookiesEnabled(makeConfig({ cookiesFromBrowser: null }))).toBe(false)
  })

  it('is true when a browser is configured', () => {
    expect(cookiesEnabled(makeConfig({ cookiesFromBrowser: 'chrome' }))).toBe(true)
  })
})

describe('isAuthRequiredError', () => {
  it('matches sign-in / age / private / members-only / bot errors', () => {
    expect(isAuthRequiredError(new Error('Sign in to confirm your age'))).toBe(true)
    expect(isAuthRequiredError(new Error('This video is age-restricted'))).toBe(true)
    expect(isAuthRequiredError(new Error('ERROR: Private video'))).toBe(true)
    expect(isAuthRequiredError(new Error('Join this channel to get access'))).toBe(true)
    expect(isAuthRequiredError('Sign in to confirm you’re not a bot')).toBe(true)
  })

  it('does not match ordinary errors', () => {
    expect(isAuthRequiredError(new Error('Video unavailable'))).toBe(false)
    expect(isAuthRequiredError(new Error('Requested format is not available'))).toBe(false)
    expect(isAuthRequiredError(new Error('HTTP Error 404: Not Found'))).toBe(false)
  })
})
