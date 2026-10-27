/**
 * The self-tests against real output captured from the pinned BtbN 9.0.2 build, a 2022 Gyan.dev build, and yt-dlp
 * 2026.10.26 and 2025.10.22, so the parsers are held to what the binaries actually print.
 */
import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import {
  FFMPEG_REQUIREMENTS,
  YTDLP_MINIMUM,
  componentChecks,
  parseBitstreamFilters,
  parseCodecs,
  parseFfmpegVersion,
  parseFilters,
  parseFormats,
  parseInputProtocols,
  parseYtdlpDebug,
  runFfmpegSelfTest,
  runYtdlpSelfTest,
  selfTestFilterChain,
  ytdlpChecks,
  type FfmpegComponents,
  type Runner
} from '@main/binaries/selftest'

const FIXTURES = path.join(__dirname, 'fixtures')
const read = (...parts: string[]): string =>
  fs.readFileSync(path.join(FIXTURES, ...parts), 'utf8')

function components(build: string): FfmpegComponents {
  const f = (kind: string): string => read('ffmpeg', build, `${kind}.txt`)
  return {
    filters: parseFilters(f('filters')),
    encoders: parseCodecs(f('encoders')),
    decoders: parseCodecs(f('decoders')),
    muxers: parseFormats(f('muxers')),
    demuxers: parseFormats(f('demuxers')),
    bsfs: parseBitstreamFilters(f('bsfs')),
    inputProtocols: parseInputProtocols(f('protocols'))
  }
}

describe('FFmpeg component lists', () => {
  for (const build of ['9.0.2', '2022-10-13']) {
    it(`parses every list ${build} prints, in its own layout`, () => {
      const c = components(build)
      expect(c.filters.has('aresample')).toBe(true)
      expect(c.filters.has('alimiter')).toBe(true)
      expect(c.filters.size).toBeGreaterThan(300)
      expect(c.encoders.has('libmp3lame')).toBe(true)
      expect(c.encoders.has('=')).toBe(false)
      expect(c.decoders.has('webp')).toBe(true)
      expect(c.muxers.has('ipod')).toBe(true)
      expect(c.demuxers.has('webm')).toBe(true)
      expect(c.demuxers.has('m4a')).toBe(true)
      expect(c.demuxers.has('D')).toBe(false)
      expect(c.bsfs.has('aac_adtstoasc')).toBe(true)
      expect(c.inputProtocols.has('https')).toBe(true)
      expect(c.inputProtocols.has('Input:')).toBe(false)
    })

    it(`finds every component the app needs in ${build}`, () => {
      const checks = componentChecks(components(build))
      expect(checks.filter((c) => !c.ok)).toEqual([])
      expect(checks.map((c) => c.id)).toEqual(FFMPEG_REQUIREMENTS.map((r) => r.id))
    })
  }

  it('names what is missing and the feature it breaks', () => {
    const c = components('9.0.2')
    c.encoders.delete('libmp3lame')
    c.inputProtocols.delete('https')
    c.decoders.delete('mp3float')
    const checks = componentChecks(c)
    const mp3 = checks.find((x) => x.id === 'mp3')!
    expect(mp3).toMatchObject({ ok: false, required: true })
    expect(mp3.detail).toBe(
      'Missing libmp3lame: MP3 downloads, the default audio format, fail'
    )
    expect(checks.find((x) => x.id === 'https')).toMatchObject({
      ok: false,
      required: false
    })
    expect(checks.find((x) => x.id === 'decode')!.ok).toBe(true)
    c.decoders.delete('mp3')
    expect(componentChecks(c).find((x) => x.id === 'decode')!.detail).toContain(
      'mp3float or mp3'
    )
  })

  it('reads the release from both version banners', () => {
    expect(parseFfmpegVersion(read('ffmpeg', '9.0.2', 'version.txt'))).toBe('9.0.2')
    expect(parseFfmpegVersion(read('ffmpeg', '2022-10-13', 'version.txt'))).toBe(
      '2022-10-13-git-9e8a327e68-full_build-www.gyan.dev'
    )
    expect(parseFfmpegVersion('ffmpeg version 7.1.1 Copyright')).toBe('7.1.1')
    expect(parseFfmpegVersion('no banner')).toBeNull()
  })

  it('runs the exact effects chain Discord playback builds, plus every character effect', () => {
    const chain = selfTestFilterChain()
    expect(
      chain.startsWith('aresample=48000,asetrate=60000,aresample=48000,atempo=')
    ).toBe(true)
    for (const name of [
      'alimiter=limit=0.97:level=disabled:latency=1',
      'apulsator',
      'aecho',
      'pan=stereo'
    ]) {
      expect(chain).toContain(name)
    }
  })
})

describe('yt-dlp debug header', () => {
  it('reads the version, solver, runtime, and FFmpeg of a working copy', () => {
    expect(parseYtdlpDebug(read('ytdlp', 'verbose-ok.txt'))).toEqual({
      version: '2026.10.26',
      ejs: '0.8.0',
      runtime: 'node-24.22.0',
      ffmpeg: true,
      ffprobe: true,
      unknownOption: null
    })
  })

  it('reads a copy that found no runtime and no FFmpeg', () => {
    expect(parseYtdlpDebug(read('ytdlp', 'verbose-no-runtime.txt'))).toMatchObject({
      runtime: null,
      ffmpeg: false,
      ejs: '0.8.0'
    })
  })

  it('reads a copy too old to know the runtime option', () => {
    expect(parseYtdlpDebug(read('ytdlp', 'verbose-too-old.txt'))).toMatchObject({
      version: null,
      runtime: null,
      unknownOption: '--js-runtimes'
    })
  })

  it('passes a working copy and fails an old one on version and runtime', () => {
    const ok = ytdlpChecks(
      '2026.10.26',
      parseYtdlpDebug(read('ytdlp', 'verbose-ok.txt')),
      true
    )
    expect(ok.every((c) => c.ok)).toBe(true)
    const old = ytdlpChecks(
      '2025.10.22',
      parseYtdlpDebug(read('ytdlp', 'verbose-too-old.txt')),
      false
    )
    expect(old.find((c) => c.id === 'version')).toMatchObject({
      ok: false,
      detail: `2025.10.22 predates the JavaScript runtime support YouTube needs`
    })
    expect(old.find((c) => c.id === 'js-runtime')!.detail).toBe(
      'yt-dlp does not know --js-runtimes'
    )
    expect(old.some((c) => c.id === 'ffmpeg')).toBe(false)
    expect(YTDLP_MINIMUM).toBe('2025.11.12')
  })
})

function fakeRunner(
  answers: (
    file: string,
    args: readonly string[]
  ) => Partial<{ code: number | null; stdout: string; stderr: string; bytes: number }>
): Runner & { calls: Array<{ file: string; args: readonly string[]; input?: Buffer }> } {
  const calls: Array<{ file: string; args: readonly string[]; input?: Buffer }> = []
  const run = (async (
    file: string,
    args: readonly string[],
    options?: { input?: Buffer }
  ) => {
    calls.push({ file, args, input: options?.input })
    const a = answers(file, args)
    return {
      code: 'code' in a ? (a.code ?? null) : 0,
      stdout: a.stdout ?? '',
      stderr: a.stderr ?? '',
      stdoutBytes: a.bytes ?? 0
    }
  }) as Runner & { calls: typeof calls }
  run.calls = calls
  return run
}

describe('runFfmpegSelfTest', () => {
  const lists = (args: readonly string[]): string => {
    const flag = args[1]?.replace(/^-/, '') ?? ''
    if (flag === 'version') return read('ffmpeg', '9.0.2', 'version.txt')
    return read('ffmpeg', '9.0.2', `${flag}.txt`)
  }

  it('passes the pinned build, feeding a second of PCM through playback and every effect', async () => {
    const run = fakeRunner((_file, args) =>
      args.includes('pipe:0') ? { bytes: 192_000 } : { stdout: lists(args) }
    )
    const result = await runFfmpegSelfTest(
      run,
      { ffmpeg: '/ff/ffmpeg', ffprobe: '/ff/ffprobe' },
      5
    )
    expect(result).toMatchObject({
      path: '/ff/ffmpeg',
      version: '9.0.2',
      at: 5,
      passed: true
    })
    expect(result.checks.every((c) => c.ok)).toBe(true)
    const pcmRuns = run.calls.filter((c) => c.input)
    expect(pcmRuns).toHaveLength(2)
    expect(pcmRuns[0].input!.length).toBe(44_100 * 4)
    expect(pcmRuns[1].args[pcmRuns[1].args.indexOf('-af') + 1]).toBe(
      selfTestFilterChain()
    )
  })

  it('fails on a broken playback run, and reports an effects failure as recommended only', async () => {
    const run = fakeRunner((_file, args) =>
      args.includes('pipe:0')
        ? args.includes('-af')
          ? { code: 1, stderr: "Option 'latency' not found\nError" }
          : { bytes: 192_000 }
        : { stdout: lists(args) }
    )
    const result = await runFfmpegSelfTest(run, { ffmpeg: 'f', ffprobe: 'p' }, 1)
    expect(result.passed).toBe(true)
    expect(result.checks.find((c) => c.id === 'effects-run')).toMatchObject({
      ok: false,
      required: false,
      detail: 'Error'
    })
  })

  it('stops after the start checks when ffmpeg does not start', async () => {
    const run = fakeRunner(() => ({ code: null }))
    const result = await runFfmpegSelfTest(run, { ffmpeg: 'f', ffprobe: 'p' }, 1)
    expect(result.passed).toBe(false)
    expect(result.checks.map((c) => c.id)).toEqual(['starts', 'ffprobe'])
  })
})

describe('runYtdlpSelfTest', () => {
  it('runs --version, then the offline header with the runtime and FFmpeg flags', async () => {
    const run = fakeRunner((_file, args) =>
      args.includes('--version')
        ? { stdout: '2026.10.26\n' }
        : { code: 2, stdout: '', stderr: read('ytdlp', 'verbose-ok.txt') }
    )
    const result = await runYtdlpSelfTest(run, '/bin/yt-dlp', {
      runtimeArgs: ['--js-runtimes', 'node:/electron'],
      env: { ELECTRON_RUN_AS_NODE: '1' },
      ffmpegDir: '/ff',
      now: 9
    })
    expect(result).toMatchObject({ version: '2026.10.26', passed: true, at: 9 })
    expect(run.calls[1].args).toEqual([
      '--ignore-config',
      '-v',
      '--js-runtimes',
      'node:/electron',
      '--ffmpeg-location',
      '/ff'
    ])
  })

  it('fails a copy that does not start', async () => {
    const run = fakeRunner(() => ({ code: null }))
    const result = await runYtdlpSelfTest(run, 'x', {
      runtimeArgs: [],
      env: {},
      ffmpegDir: null,
      now: 1
    })
    expect(result.passed).toBe(false)
    expect(result.checks[0]).toMatchObject({ id: 'starts', ok: false })
  })
})
