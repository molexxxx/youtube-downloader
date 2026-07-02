import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createAudioPlayerMock } = vi.hoisted(() => ({
  createAudioPlayerMock: vi.fn(
    () =>
      ({
        on: vi.fn(),
        emit: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        unpause: vi.fn(),
        stop: vi.fn()
      }) as never
  )
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

import {
  buildAudioFilterChain,
  buildFfmpegArgs,
  buildResolveUrlArgs,
  buildStreamArgs,
  createSteadyPcmChunker,
  parseFfmpegDuration,
  sanitizeEffects
} from '@main/discord/audio'
import { GuildMusicPlayer } from '@main/discord/player'
import { DEFAULT_AUDIO_EFFECTS } from '@shared/types'

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

describe('buildResolveUrlArgs', () => {
  it('asks for the direct media URL instead of piping bytes', () => {
    const args = buildResolveUrlArgs('https://x', false)
    expect(args).toContain('-g')
    expect(args).not.toContain('-o')
    const fmtIdx = args.indexOf('-f')
    expect(args[fmtIdx + 1]).toBe('bestaudio/best')
  })

  it('toggles cookies like the streaming args', () => {
    expect(buildResolveUrlArgs('https://x', false)).not.toContain('--cookies')
    expect(buildResolveUrlArgs('https://x', true)).toContain('--cookies')
  })
})

describe('buildFfmpegArgs', () => {
  it('transcodes stdin to 48kHz stereo raw PCM for streamed tracks', () => {
    const args = buildFfmpegArgs('pipe:0')
    expect(args[0]).toBe('-i')
    expect(args[1]).toBe('pipe:0')
    expect(args).toContain('s16le')
    expect(args[args.length - 1]).toBe('pipe:1')
  })

  it('reads a local file directly for downloaded tracks', () => {
    const args = buildFfmpegArgs('C:\\media\\song.m4a')
    expect(args[1]).toBe('C:\\media\\song.m4a')
  })

  it('applies a seek offset as an input option for seekable files', () => {
    const args = buildFfmpegArgs('C:\\media\\song.m4a', 90)
    expect(args.slice(0, 4)).toEqual(['-ss', '90', '-i', 'C:\\media\\song.m4a'])
  })

  it('applies a seek offset after the input for pipes (not input-seekable)', () => {
    const args = buildFfmpegArgs('pipe:0', 90)
    expect(args.slice(0, 4)).toEqual(['-i', 'pipe:0', '-ss', '90'])
  })

  it('omits the seek flag at position zero', () => {
    expect(buildFfmpegArgs('pipe:0', 0)).not.toContain('-ss')
    expect(buildFfmpegArgs('C:\\media\\x.m4a', 0)).not.toContain('-ss')
  })

  it('omits the filter flag at default effects', () => {
    expect(buildFfmpegArgs('pipe:0', 0, DEFAULT_AUDIO_EFFECTS)).not.toContain('-af')
  })

  it('input-seeks direct URLs with reconnect protection', () => {
    const args = buildFfmpegArgs('https://cdn.example/audio', 90)
    // Input options: reconnect flags and -ss must precede -i for URLs.
    expect(args.indexOf('-reconnect')).toBeGreaterThanOrEqual(0)
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'))
    expect(args[args.indexOf('-i') + 1]).toBe('https://cdn.example/audio')
  })

  it('omits reconnect flags for pipes and local files', () => {
    expect(buildFfmpegArgs('pipe:0', 0)).not.toContain('-reconnect')
    expect(buildFfmpegArgs('C:\\media\\song.m4a', 0)).not.toContain('-reconnect')
  })

  it('inserts the filter chain before the output format', () => {
    const args = buildFfmpegArgs('pipe:0', 0, { ...DEFAULT_AUDIO_EFFECTS, speed: 1.5 })
    const afIdx = args.indexOf('-af')
    expect(afIdx).toBeGreaterThan(args.indexOf('pipe:0'))
    expect(args[afIdx + 1]).toBe('atempo=1.5000')
    expect(afIdx).toBeLessThan(args.indexOf('s16le'))
  })
})

describe('buildAudioFilterChain', () => {
  it('returns null when everything is at its default', () => {
    expect(buildAudioFilterChain(DEFAULT_AUDIO_EFFECTS)).toBeNull()
  })

  it('maps speed to atempo without touching pitch', () => {
    expect(buildAudioFilterChain({ ...DEFAULT_AUDIO_EFFECTS, speed: 1.25 })).toBe(
      'atempo=1.2500'
    )
  })

  it('compensates tempo when shifting pitch, so speed stays independent', () => {
    // asetrate raises tempo by 1.25 too; atempo must counter it back to 1x.
    expect(buildAudioFilterChain({ ...DEFAULT_AUDIO_EFFECTS, pitch: 1.25 })).toBe(
      `asetrate=60000,aresample=48000,atempo=${(1 / 1.25).toFixed(4)}`
    )
  })

  it('nightcore (speed == pitch) needs no atempo correction', () => {
    expect(
      buildAudioFilterChain({ ...DEFAULT_AUDIO_EFFECTS, speed: 1.25, pitch: 1.25 })
    ).toBe('asetrate=60000,aresample=48000')
  })

  it('splits atempo corrections outside the 0.5-2 per-instance range', () => {
    // speed 0.5 at pitch 2 needs a 0.25x correction: two chained sqrt factors.
    const chain = buildAudioFilterChain({
      ...DEFAULT_AUDIO_EFFECTS,
      speed: 0.5,
      pitch: 2
    })
    expect(chain).toContain('atempo=0.5000,atempo=0.5000')
  })

  it('maps the tone controls to bass/equalizer/treble with a limiter on boost', () => {
    const chain = buildAudioFilterChain({
      ...DEFAULT_AUDIO_EFFECTS,
      bassGain: 9,
      midGain: -3,
      trebleGain: 2
    })
    expect(chain).toBe(
      'bass=g=9,equalizer=f=1000:t=q:w=1:g=-3,treble=g=2,alimiter=limit=0.97'
    )
  })

  it('omits the limiter when only cutting', () => {
    expect(buildAudioFilterChain({ ...DEFAULT_AUDIO_EFFECTS, bassGain: -6 })).toBe(
      'bass=g=-6'
    )
  })

  it('appends the character effect last', () => {
    const chain = buildAudioFilterChain({ ...DEFAULT_AUDIO_EFFECTS, mode: 'rotate' })
    expect(chain).toBe('apulsator=hz=0.15')
  })
})

describe('sanitizeEffects', () => {
  it('clamps out-of-range knobs', () => {
    const fx = sanitizeEffects({ speed: 9, pitch: 0.01, bassGain: 40, midGain: -40 })
    expect(fx.speed).toBe(2)
    expect(fx.pitch).toBe(0.5)
    expect(fx.bassGain).toBe(12)
    expect(fx.midGain).toBe(-12)
  })

  it('drops unknown modes and non-numeric values', () => {
    const fx = sanitizeEffects({
      mode: 'reverse-polarity' as never,
      speed: 'fast' as never
    })
    expect(fx.mode).toBe('none')
    expect(fx.speed).toBe(1)
  })

  it('fills defaults for a null payload', () => {
    expect(sanitizeEffects(null)).toEqual(DEFAULT_AUDIO_EFFECTS)
  })
})

describe('parseFfmpegDuration', () => {
  it('parses the stderr banner into seconds', () => {
    const banner =
      "Input #0, mp3, from 'song.mp3':\n  Duration: 00:03:25.66, start: 0.025057, bitrate: 320 kb/s"
    expect(parseFfmpegDuration(banner)).toBe(3 * 60 + 25)
  })

  it('handles hour-long media', () => {
    expect(parseFfmpegDuration('Duration: 01:02:03.00, start')).toBe(3723)
  })

  it('returns null when the banner reports no duration', () => {
    expect(parseFfmpegDuration('Duration: N/A, bitrate: N/A')).toBeNull()
    expect(parseFfmpegDuration('random ffmpeg noise')).toBeNull()
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

  it('configures the audio player to tolerate source stalls', () => {
    new GuildMusicPlayer('guild-1', {
      adapterCreator: (() => null) as never,
      channelName: () => null
    })

    expect(createAudioPlayerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        behaviors: expect.objectContaining({
          maxMissedFrames: 100,
          noSubscriber: 'pause'
        })
      })
    )
  })
})
