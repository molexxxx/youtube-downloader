import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createAudioPlayerMock } = vi.hoisted(() => ({
  createAudioPlayerMock: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    unpause: vi.fn(),
    stop: vi.fn()
  }) as never)
}))

vi.mock('electron-store', () => {
  class MockElectronStore {
    constructor(_opts: unknown) {}
    get(key: string) {
      if (key === 'guildSettings') return {}
      return undefined
    }
    set(_key: string, _value: unknown) {}
    delete(_key: string) {}
  }

  return { default: MockElectronStore }
})

// @discordjs/voice is only needed by createTrackResource; stub it so importing the
// module under test doesn't pull in the real voice/encryption stack.
vi.mock('@discordjs/voice', () => ({
  createAudioPlayer: createAudioPlayerMock,
  createAudioResource: vi.fn(),
  NoSubscriberBehavior: { Pause: 'pause' },
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

import { buildStreamArgs, createSteadyPcmChunker } from '@main/discord/audio'
import { GuildMusicPlayer } from '@main/discord/player'

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

describe('createSteadyPcmChunker', () => {
  it('emits fixed-size 20ms PCM frames', async () => {
    const frames: Buffer[] = []
    const chunker = createSteadyPcmChunker((chunk) => frames.push(Buffer.from(chunk)))

    const frameBytes = 3840
    chunker.write(Buffer.alloc(frameBytes * 2 + 100, 1))
    chunker.end()

    await new Promise((resolve) => setImmediate(resolve))

    expect(frames).toHaveLength(3)
    expect(frames[0]).toHaveLength(frameBytes)
    expect(frames[1]).toHaveLength(frameBytes)
    expect(frames[2]).toHaveLength(100)
  })
})

describe('GuildMusicPlayer', () => {
  beforeEach(() => {
    createAudioPlayerMock.mockClear()
  })

  it('configures the audio player to tolerate brief network hiccups', () => {
    new GuildMusicPlayer('guild-1', { adapterCreator: (() => null) as never, channelName: () => null })

    expect(createAudioPlayerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        behaviors: expect.objectContaining({
          maxMissedFrames: 10,
          noSubscriber: 'pause'
        })
      })
    )
  })
})
