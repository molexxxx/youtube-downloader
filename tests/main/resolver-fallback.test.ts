import { describe, expect, it, vi, beforeEach } from 'vitest'

const { engineMock, cookieFlagsMock, cookiesEnabledMock, loggerMock } = vi.hoisted(() => ({
  engineMock: vi.fn(),
  cookieFlagsMock: vi.fn(() => ({ cookies: '/userdata/cookies.txt' })),
  cookiesEnabledMock: vi.fn(() => true),
  loggerMock: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

vi.mock('@main/config', () => ({ getConfig: () => ({ cookiesFromBrowser: 'auto' }) }))
vi.mock('@main/binaries/ffmpeg-binary', () => ({ ffmpegDir: () => '/bin' }))
vi.mock('@main/binaries/ytdlp-binary', () => ({ ytdlpPath: () => '/bin/yt-dlp' }))
vi.mock('@main/logger', () => ({ logger: loggerMock }))
vi.mock('@main/ytdlp/cookies', () => ({
  cookieFlags: cookieFlagsMock,
  cookiesEnabled: cookiesEnabledMock,
  isAuthRequiredError: (error: unknown): boolean => {
    const message = error instanceof Error ? error.message : String(error)
    return (
      /sign in to confirm/i.test(message) ||
      /confirm your age|age[- ]restricted/i.test(message) ||
      /private video/i.test(message) ||
      /members[- ]only|join this channel/i.test(message) ||
      /not a bot/i.test(message)
    )
  }
}))
vi.mock('youtube-dl-exec', () => ({ create: () => engineMock }))

import { getInfo, isPlaylistUrl } from '@main/ytdlp/resolver'

beforeEach(() => {
  engineMock.mockReset()
  cookieFlagsMock.mockClear()
  cookiesEnabledMock.mockClear()
  cookiesEnabledMock.mockReturnValue(true)
  loggerMock.warn.mockClear()
})

describe('getInfo cookie fallback', () => {
  it('probes cookie-free first and succeeds without cookies', async () => {
    engineMock.mockResolvedValueOnce({ id: 'abc', title: 'Clip' })
    const info = await getInfo('https://x')
    expect(info.title).toBe('Clip')
    expect(engineMock).toHaveBeenCalledTimes(1)
    // first (and only) call omits cookie flags
    expect(engineMock.mock.calls[0][1].cookies).toBeUndefined()
  })

  it('retries with cookies when the video requires authentication', async () => {
    engineMock
      .mockRejectedValueOnce(
        new Error('ERROR: [youtube] x: Private video. Sign in if you have been granted access')
      )
      .mockResolvedValueOnce({ id: 'abc', title: 'Clip' })
    const info = await getInfo('https://x')
    expect(info.title).toBe('Clip')
    expect(engineMock).toHaveBeenCalledTimes(2)
    // retry includes the cookie flags
    expect(engineMock.mock.calls[1][1]).toMatchObject({ cookies: '/userdata/cookies.txt' })
    expect(loggerMock.warn).toHaveBeenCalled()
  })

  it('does not retry with cookies for ordinary errors', async () => {
    engineMock.mockRejectedValueOnce(new Error('ERROR: Video unavailable'))
    await expect(getInfo('https://x')).rejects.toThrow(/Video unavailable/)
    expect(engineMock).toHaveBeenCalledTimes(1)
  })

  it('does not retry when cookies are disabled even on an auth error', async () => {
    cookiesEnabledMock.mockReturnValue(false)
    engineMock.mockRejectedValueOnce(new Error('ERROR: Private video'))
    await expect(getInfo('https://x')).rejects.toThrow(/Private video/)
    expect(engineMock).toHaveBeenCalledTimes(1)
  })
})

describe('isPlaylistUrl', () => {
  it('treats a watch URL with a list= param as a single video', () => {
    expect(
      isPlaylistUrl('https://www.youtube.com/watch?v=nxg4C365LbQ&list=PLUo7r5&index=2')
    ).toBe(false)
  })

  it('treats a bare watch URL as a single video', () => {
    expect(isPlaylistUrl('https://www.youtube.com/watch?v=nxg4C365LbQ')).toBe(false)
  })

  it('treats a youtu.be short link as a single video', () => {
    expect(isPlaylistUrl('https://youtu.be/nxg4C365LbQ?list=PLUo7r5')).toBe(false)
  })

  it('treats a /playlist URL as a playlist', () => {
    expect(isPlaylistUrl('https://www.youtube.com/playlist?list=PLUo7r5eLeJSZ')).toBe(true)
  })

  it('treats a non-watch list= URL as a playlist', () => {
    expect(isPlaylistUrl('https://www.youtube.com/embed/videoseries?list=PLUo7r5')).toBe(true)
  })

  it('returns false for an unparseable string', () => {
    expect(isPlaylistUrl('not a url')).toBe(false)
  })
})

describe('getInfo playlist handling', () => {
  it('forces a single-video probe for a watch URL with a list= param', async () => {
    engineMock.mockResolvedValueOnce({ id: 'abc', title: 'Clip' })
    await getInfo('https://www.youtube.com/watch?v=abc&list=PL1')
    const opts = engineMock.mock.calls[0][1]
    expect(opts.noPlaylist).toBe(true)
    expect(opts.flatPlaylist).toBe(false)
  })

  it('flat-probes a playlist URL and does not set noPlaylist', async () => {
    engineMock.mockResolvedValueOnce({ _type: 'playlist', entries: [] })
    await getInfo('https://www.youtube.com/playlist?list=PL1')
    const opts = engineMock.mock.calls[0][1]
    expect(opts.flatPlaylist).toBe(true)
    expect(opts.noPlaylist).toBeUndefined()
  })
})
