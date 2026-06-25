import { describe, expect, it, vi } from 'vitest'

// @discordjs/voice is only needed by createTrackResource; stub it so importing the
// module under test doesn't pull in the real voice/encryption stack.
vi.mock('@discordjs/voice', () => ({
  createAudioResource: vi.fn(),
  StreamType: { Raw: 'raw' }
}))
vi.mock('@main/config', () => ({ getConfig: () => ({}) }))
vi.mock('@main/binaries/ffmpeg-binary', () => ({ ffmpegPath: () => '/bin/ffmpeg' }))
vi.mock('@main/binaries/ytdlp-binary', () => ({ ytdlpPath: () => '/bin/yt-dlp' }))
vi.mock('@main/ytdlp/cookies', () => ({
  cookieArgs: () => ['--cookies', '/cache/cookies.txt'],
  cookiesEnabled: () => true,
  isAuthRequiredError: () => false
}))

import { buildStreamArgs } from '@main/discord/audio'

describe('buildStreamArgs', () => {
  it('streams best audio to stdout for a single video', () => {
    const args = buildStreamArgs('https://x', false)
    expect(args).toContain('https://x')
    expect(args).toContain('--ignore-config')
    expect(args).toContain('--no-playlist')
    const fmtIdx = args.indexOf('-f')
    expect(args[fmtIdx + 1]).toBe('bestaudio/best')
    const outIdx = args.indexOf('-o')
    expect(args[outIdx + 1]).toBe('-')
  })

  it('omits cookies on the first (cookie-free) attempt', () => {
    expect(buildStreamArgs('https://x', false)).not.toContain('--cookies')
  })

  it('adds cookie flags when retrying with cookies', () => {
    const args = buildStreamArgs('https://x', true)
    expect(args).toContain('--cookies')
    expect(args).toContain('/cache/cookies.txt')
  })
})
