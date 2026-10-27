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
vi.mock('@main/binaries/ytdlp-binary', () => ({
  ytdlpPath: () => '/bin/yt-dlp',
  trackYtdlp: <T>(child: T): T => child,
  managedEngine: <T>(engine: T): T => engine,
  ytdlpRuntimeArgs: () => ['--js-runtimes', 'node:/electron'],
  ytdlpRuntimeFlags: () => ({ jsRuntimes: 'node:/electron' }),
  ytdlpEnv: () => ({ ELECTRON_RUN_AS_NODE: '1' })
}))
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
  availabilityDelayMs,
  ffmpegFailureReason,
  parseFfmpegDuration,
  parseResolvedStream,
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

  it('names the JavaScript runtime yt-dlp needs for YouTube and keeps TLS validation on', () => {
    const args = buildStreamArgs('https://x', false)
    expect(args[args.indexOf('--js-runtimes') + 1]).toBe('node:/electron')
    expect(args).not.toContain('--no-check-certificates')
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
  it('asks for the direct media URL and when it is served instead of piping bytes', () => {
    const args = buildResolveUrlArgs('https://x', false)
    expect(args[args.indexOf('--print') + 1]).toBe('urls')
    expect(args[args.lastIndexOf('--print') + 1]).toBe('%(available_at)s')
    expect(args).not.toContain('-g')
    expect(args).not.toContain('-o')
    expect(args).toContain('--js-runtimes')
    const fmtIdx = args.indexOf('-f')
    expect(args[fmtIdx + 1]).toBe('bestaudio/best')
  })

  it('toggles cookies like the streaming args', () => {
    expect(buildResolveUrlArgs('https://x', false)).not.toContain('--cookies')
    expect(buildResolveUrlArgs('https://x', true)).toContain('--cookies')
  })
})

describe('parseResolvedStream', () => {
  it('reads the media URL and when YouTube starts serving it', () => {
    const out = 'https://rr1.googlevideo.com/videoplayback?c=TVHTML5\r\n1793132378\r\n'
    expect(parseResolvedStream(out)).toEqual({
      url: 'https://rr1.googlevideo.com/videoplayback?c=TVHTML5',
      availableAt: 1793132378
    })
  })

  it('treats a missing or NA timestamp as available now', () => {
    expect(parseResolvedStream('https://cdn/a\n')).toEqual({
      url: 'https://cdn/a',
      availableAt: null
    })
    expect(parseResolvedStream('https://cdn/a\nNA\n')?.availableAt).toBeNull()
  })

  it('returns null when no URL was printed', () => {
    expect(parseResolvedStream('')).toBeNull()
    expect(parseResolvedStream('1793132378\n')).toBeNull()
  })
})

describe('availabilityDelayMs', () => {
  const now = 1_793_132_374_000

  it('does not wait without a timestamp or once it has passed', () => {
    expect(availabilityDelayMs(null, now)).toBe(0)
    expect(availabilityDelayMs(now / 1000 - 5, now)).toBe(0)
  })

  it('waits until the URL is served, plus a small margin', () => {
    expect(availabilityDelayMs(now / 1000 + 4, now)).toBe(4250)
  })

  it('caps the wait so a bad timestamp cannot stall playback', () => {
    expect(availabilityDelayMs(now / 1000 + 600, now)).toBe(20_000)
  })
})

describe('ffmpegFailureReason', () => {
  it('reports the HTTP status a server refused the input with', () => {
    const stderr =
      'fexp=51565116&c=TVHTML5&sig=AE0s2JYw: Server returned 403 Forbidden (access denied)\n' +
      'Error opening input files: Server returned 403 Forbidden (access denied)\n'
    expect(ffmpegFailureReason(stderr)).toBe(
      'Server returned 403 Forbidden (access denied)'
    )
  })

  it('falls back to the last line with URLs elided', () => {
    const stderr =
      'Input #0\n[in#0] Error opening input https://rr1.googlevideo.com/x?sig=1: Invalid data\n'
    expect(ffmpegFailureReason(stderr)).toBe(
      '[in#0] Error opening input <url> Invalid data'
    )
  })

  it('is empty for an empty stderr', () => {
    expect(ffmpegFailureReason('')).toBe('')
  })
})

describe('buildFfmpegArgs', () => {
  it('transcodes stdin to 48kHz stereo raw PCM for streamed tracks', () => {
    const args = buildFfmpegArgs('pipe:0')
    expect(args.slice(0, 3)).toEqual(['-hide_banner', '-i', 'pipe:0'])
    expect(args).not.toContain('-nostdin')
    expect(args).toContain('s16le')
    expect(args[args.length - 1]).toBe('pipe:1')
  })

  it('reads a local file directly for downloaded tracks', () => {
    const args = buildFfmpegArgs('C:\\media\\song.m4a')
    expect(args.slice(0, 4)).toEqual([
      '-hide_banner',
      '-nostdin',
      '-i',
      'C:\\media\\song.m4a'
    ])
  })

  it('applies a seek offset as an input option for seekable files', () => {
    const args = buildFfmpegArgs('C:\\media\\song.m4a', 90)
    expect(args.slice(2, 6)).toEqual(['-ss', '90', '-i', 'C:\\media\\song.m4a'])
  })

  it('applies a seek offset after the input for pipes (not input-seekable)', () => {
    const args = buildFfmpegArgs('pipe:0', 90)
    expect(args.slice(1, 5)).toEqual(['-i', 'pipe:0', '-ss', '90'])
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
    expect(args[args.indexOf('-reconnect_on_network_error') + 1]).toBe('1')
    expect(args).toContain('-nostdin')
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
      `aresample=48000,asetrate=60000,aresample=48000,atempo=${(1 / 1.25).toFixed(4)}`
    )
  })

  it('resamples to 48kHz before asetrate, so a 44.1kHz source shifts by the asked amount', () => {
    const chain = buildAudioFilterChain({ ...DEFAULT_AUDIO_EFFECTS, pitch: 1.5 })!
    expect(chain.split(',').slice(0, 2)).toEqual(['aresample=48000', 'asetrate=72000'])
  })

  it('nightcore (speed == pitch) needs no atempo correction', () => {
    expect(
      buildAudioFilterChain({ ...DEFAULT_AUDIO_EFFECTS, speed: 1.25, pitch: 1.25 })
    ).toBe('aresample=48000,asetrate=60000,aresample=48000')
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
      'bass=g=9,equalizer=f=1000:t=q:w=1:g=-3,treble=g=2,alimiter=limit=0.97:level=disabled:latency=1'
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
