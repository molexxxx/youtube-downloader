/**
 * Self-tests for a yt-dlp and an FFmpeg build: offline checks that each provides what this app uses. Every requirement
 * comes from the code that runs the binary: the yt-dlp release notes and README for the JavaScript runtime YouTube
 * needs since 2025.11.12, yt-dlp's postprocessor tables (yt_dlp/postprocessor/ffmpeg.py) for the encoders, muxers, and
 * bitstream filters its audio extraction, thumbnails, chapters, and SponsorBlock cuts call, and the Discord playback
 * filter chain, which runs for real on a second of PCM.
 */
import { spawn } from 'child_process'
import type { SelfTestCheck, SelfTestReport } from '@shared/types'
import { compareVersions, parseVersion } from './ytdlp/release'
import { buildAudioFilterChain, EFFECT_FILTERS } from '../discord/filters'

/** The first yt-dlp release that requires, and accepts, an external JavaScript runtime for YouTube. */
export const YTDLP_MINIMUM = '2025.11.12'

/** One finished run of a program: its exit code (null when it did not start), output, and output size. */
export interface RunResult {
  code: number | null
  stdout: string
  stderr: string
  stdoutBytes: number
}

/** Runs a program with optional stdin bytes; never rejects. */
export type Runner = (
  file: string,
  args: readonly string[],
  options?: { input?: Buffer; env?: NodeJS.ProcessEnv; timeoutMs?: number }
) => Promise<RunResult>

const MAX_CAPTURE = 4 * 1024 * 1024

/** The real {@link Runner}: spawns hidden, writes `input` to stdin, keeps at most 4 MB of each output stream. */
export const spawnRunner: Runner = (file, args, options = {}) =>
  new Promise((resolve) => {
    const out: Buffer[] = []
    const err: Buffer[] = []
    let outBytes = 0
    let errBytes = 0
    let settled = false
    const finish = (code: number | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        code,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
        stdoutBytes: outBytes
      })
    }
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(file, [...args], {
        windowsHide: true,
        env: options.env,
        stdio: ['pipe', 'pipe', 'pipe']
      })
    } catch {
      resolve({ code: null, stdout: '', stderr: '', stdoutBytes: 0 })
      return
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish(null)
    }, options.timeoutMs ?? 30_000)
    child.stdout?.on('data', (chunk: Buffer) => {
      outBytes += chunk.length
      if (outBytes <= MAX_CAPTURE) out.push(chunk)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      errBytes += chunk.length
      if (errBytes <= MAX_CAPTURE) err.push(chunk)
    })
    child.stdin?.on('error', () => undefined)
    child.stdin?.end(options.input)
    child.on('error', () => finish(null))
    child.on('close', (code) => finish(code))
  })

function check(
  id: string,
  label: string,
  required: boolean,
  ok: boolean,
  detail: string
): SelfTestCheck {
  return { id, label, required, ok, detail }
}

function report(
  path: string,
  version: string | null,
  at: number,
  checks: SelfTestCheck[]
): SelfTestReport {
  return { path, version, at, passed: checks.every((c) => c.ok || !c.required), checks }
}

/** What `yt-dlp -v` prints about itself before it asks for a URL. */
export interface YtdlpDebug {
  version: string | null
  /** The yt-dlp-ejs challenge solver version, when bundled or installed. */
  ejs: string | null
  /** The JavaScript runtime yt-dlp found, such as node-24.22.0, or null for none. */
  runtime: string | null
  ffmpeg: boolean
  ffprobe: boolean
  /** The option yt-dlp refused, when it is too old to know one the app passes. */
  unknownOption: string | null
}

export function parseYtdlpDebug(text: string): YtdlpDebug {
  const line = (prefix: string): string | null => {
    const found = text.split(/\r?\n/).find((l) => l.startsWith(`[debug] ${prefix}`))
    return found ? found.slice(`[debug] ${prefix}`.length).trim() : null
  }
  const versionLine = line('yt-dlp version')
  const version = versionLine
    ? parseVersion(
        /(?:\S+@)?(\d{4}\.\d{1,2}\.\d{1,2}(?:\.\d+)?)/.exec(versionLine)?.[1] ?? ''
      )
    : null
  const exe = line('exe versions:') ?? ''
  const runtimes = line('JS runtimes:')
  return {
    version,
    ejs: /yt_dlp_ejs-(\S+?)(?:,|$)/.exec(line('Optional libraries:') ?? '')?.[1] ?? null,
    runtime: runtimes && runtimes !== 'none' ? runtimes : null,
    ffmpeg: /\bffmpeg\b/.test(exe),
    ffprobe: /\bffprobe\b/.test(exe),
    unknownOption: /no such option: (\S+)/.exec(text)?.[1] ?? null
  }
}

/** The yt-dlp checks over its `--version` answer and its `-v` header. */
export function ytdlpChecks(
  version: string | null,
  debug: YtdlpDebug,
  withFfmpeg: boolean
): SelfTestCheck[] {
  const recent = version !== null && compareVersions(version, YTDLP_MINIMUM) >= 0
  const notRun = debug.unknownOption
    ? `Not checked: yt-dlp stopped at ${debug.unknownOption}, which it does not know`
    : null
  const checks = [
    check(
      'starts',
      'yt-dlp starts',
      true,
      version !== null,
      version !== null
        ? `Reports version ${version}`
        : 'It did not start or did not report a version'
    ),
    check(
      'version',
      `yt-dlp ${YTDLP_MINIMUM} or newer`,
      true,
      recent,
      recent
        ? 'New enough for the JavaScript runtime YouTube needs'
        : version === null
          ? 'Unknown version'
          : `${version} predates the JavaScript runtime support YouTube needs`
    ),
    check(
      'ejs',
      'YouTube challenge solver (yt-dlp-ejs)',
      true,
      debug.ejs !== null,
      debug.ejs !== null
        ? `yt-dlp-ejs ${debug.ejs}`
        : (notRun ??
            'Missing; install yt-dlp-ejs alongside yt-dlp, or use the app copy, which bundles it')
    ),
    check(
      'js-runtime',
      'JavaScript runtime for YouTube',
      true,
      debug.runtime !== null,
      debug.runtime !== null
        ? `Uses ${debug.runtime}`
        : debug.unknownOption
          ? `yt-dlp does not know ${debug.unknownOption}`
          : 'yt-dlp found no JavaScript runtime it can start'
    )
  ]
  if (withFfmpeg) {
    checks.push(
      check(
        'ffmpeg',
        'Finds FFmpeg and ffprobe',
        true,
        debug.ffmpeg && debug.ffprobe,
        debug.ffmpeg && debug.ffprobe
          ? 'Both found at the folder the app passes'
          : (notRun ??
              `yt-dlp did not find ${debug.ffmpeg ? 'ffprobe' : 'ffmpeg'} at the folder the app passes`)
      )
    )
  }
  return checks
}

/** Runs the yt-dlp self-test: `--version`, then the offline `-v` header with the app's runtime and FFmpeg flags. */
export async function runYtdlpSelfTest(
  run: Runner,
  file: string,
  options: {
    runtimeArgs: string[]
    env: NodeJS.ProcessEnv
    ffmpegDir: string | null
    now: number
  }
): Promise<SelfTestReport> {
  const versionRun = await run(file, ['--ignore-config', '--version'], {
    env: options.env,
    timeoutMs: 60_000
  })
  const version = versionRun.code === 0 ? parseVersion(versionRun.stdout) : null
  const debugRun = await run(
    file,
    [
      '--ignore-config',
      '-v',
      ...options.runtimeArgs,
      ...(options.ffmpegDir ? ['--ffmpeg-location', options.ffmpegDir] : [])
    ],
    { env: options.env, timeoutMs: 60_000 }
  )
  const debug = parseYtdlpDebug(`${debugRun.stdout}\n${debugRun.stderr}`)
  return report(
    file,
    version ?? debug.version,
    options.now,
    ytdlpChecks(version ?? debug.version, debug, options.ffmpegDir !== null)
  )
}

/** The component lists an FFmpeg build reports. */
export interface FfmpegComponents {
  filters: Set<string>
  encoders: Set<string>
  decoders: Set<string>
  muxers: Set<string>
  demuxers: Set<string>
  bsfs: Set<string>
  inputProtocols: Set<string>
}

function linesAfterSeparator(text: string): string[] {
  const lines = text.split(/\r?\n/)
  const sep = lines.findIndex((l) => /^\s*-{2,}\s*$/.test(l))
  return sep >= 0 ? lines.slice(sep + 1) : lines
}

/** The names in `-encoders` or `-decoders`: the token after the six flag columns. */
export function parseCodecs(text: string): Set<string> {
  const names = new Set<string>()
  for (const line of linesAfterSeparator(text)) {
    const [flags, name] = line.trim().split(/\s+/)
    if (name && /^[VASD.][F.][S.][X.][B.][D.]$/.test(flags)) names.add(name)
  }
  return names
}

/** The names in `-muxers` or `-demuxers`, after the D/E/d flag columns; `matroska,webm` yields both. */
export function parseFormats(text: string): Set<string> {
  const names = new Set<string>()
  for (const line of linesAfterSeparator(text)) {
    const tokens = line.trim().split(/\s+/)
    let i = 0
    while (i < tokens.length - 1 && /^[DEd]{1,3}$/.test(tokens[i])) i++
    if (i === 0 || !tokens[i]) continue
    for (const name of tokens[i].split(',')) names.add(name)
  }
  return names
}

/** The names in `-filters`: lines of flag columns, a name, and an input->output spec. */
export function parseFilters(text: string): Set<string> {
  const names = new Set<string>()
  for (const line of text.split(/\r?\n/)) {
    const [flags, name, io] = line.trim().split(/\s+/)
    if (name && io && io.includes('->') && /^[TSC.|]{1,3}$/.test(flags)) names.add(name)
  }
  return names
}

/** The names in `-bsfs`, one per line after its heading. */
export function parseBitstreamFilters(text: string): Set<string> {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((l) => /^Bitstream filters:/.test(l.trim()))
  return new Set(
    lines
      .slice(start + 1)
      .map((l) => l.trim())
      .filter((l) => /^[a-z0-9_]+$/.test(l))
  )
}

/** The input protocols in `-protocols`: the names between "Input:" and "Output:". */
export function parseInputProtocols(text: string): Set<string> {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const start = lines.indexOf('Input:')
  const end = lines.indexOf('Output:')
  return new Set(
    lines.slice(start + 1, end > start ? end : undefined).filter((l) => l.length > 0)
  )
}

/** The FFmpeg release `-version` names, such as 9.0.2 from "ffmpeg version n9.0.2-17-g2a571b6068-20260930". */
export function parseFfmpegVersion(text: string): string | null {
  const word = /ffmpeg version (\S+)/.exec(text)?.[1]
  if (!word) return null
  return /^n?(\d+\.\d+(?:\.\d+)?)/.exec(word)?.[1] ?? word
}

type Need = { list: keyof FfmpegComponents; name: string | string[] }

/** What one FFmpeg check needs, and the feature that breaks without it. */
interface Requirement {
  id: string
  label: string
  required: boolean
  breaks: string
  needs: Need[]
}

const n = (list: keyof FfmpegComponents, ...names: string[]): Need[] =>
  names.map((name) => ({ list, name }))

/** Every component the app's FFmpeg use needs, grouped by the feature that uses it. */
export const FFMPEG_REQUIREMENTS: readonly Requirement[] = [
  {
    id: 'decode',
    label: 'Reads YouTube and local audio',
    required: true,
    breaks: 'Discord playback and downloads fail',
    needs: [
      ...n('decoders', 'opus', 'aac', 'vorbis', 'flac'),
      { list: 'decoders', name: ['mp3float', 'mp3'] },
      ...n('demuxers', 'matroska', 'mov', 'mp3', 'ogg', 'flac', 'wav')
    ]
  },
  {
    id: 'merge',
    label: 'Merges video and audio into MP4 and MKV',
    required: true,
    breaks: 'video downloads fail at the merge',
    needs: n('muxers', 'mp4', 'matroska')
  },
  {
    id: 'mp3',
    label: 'Converts to MP3',
    required: true,
    breaks: 'MP3 downloads, the default audio format, fail',
    needs: [...n('encoders', 'libmp3lame'), ...n('muxers', 'mp3')]
  },
  {
    id: 'm4a',
    label: 'Converts to M4A',
    required: false,
    breaks: 'M4A downloads fail',
    needs: [
      ...n('encoders', 'aac'),
      ...n('muxers', 'ipod'),
      ...n('bsfs', 'aac_adtstoasc')
    ]
  },
  {
    id: 'opus',
    label: 'Converts to Opus',
    required: false,
    breaks: 'Opus downloads fail',
    needs: [...n('encoders', 'libopus'), ...n('muxers', 'opus')]
  },
  {
    id: 'flac-wav',
    label: 'Converts to FLAC and WAV',
    required: false,
    breaks: 'FLAC and WAV downloads fail',
    needs: [...n('encoders', 'flac', 'pcm_s16le'), ...n('muxers', 'flac', 'wav')]
  },
  {
    id: 'thumbnails',
    label: 'Embeds thumbnails',
    required: false,
    breaks: 'thumbnails are not embedded',
    needs: [
      ...n('demuxers', 'image2'),
      ...n('decoders', 'webp'),
      ...n('encoders', 'mjpeg', 'png'),
      ...n('muxers', 'image2'),
      ...n('bsfs', 'mjpeg2jpeg')
    ]
  },
  {
    id: 'chapters',
    label: 'Writes chapters and SponsorBlock cuts',
    required: false,
    breaks: 'chapters and SponsorBlock removal fail',
    needs: n('demuxers', 'ffmetadata', 'concat')
  },
  {
    id: 'discord-output',
    label: 'Produces Discord audio',
    required: true,
    breaks: 'Discord playback fails',
    needs: [
      ...n('filters', 'aresample'),
      ...n('encoders', 'pcm_s16le'),
      ...n('muxers', 's16le')
    ]
  },
  {
    id: 'effects',
    label: 'Discord audio effects',
    required: false,
    breaks: 'Discord audio effects fail',
    needs: n(
      'filters',
      'asetrate',
      'atempo',
      'bass',
      'treble',
      'equalizer',
      'alimiter',
      'tremolo',
      'vibrato',
      'apulsator',
      'pan',
      'aecho'
    )
  },
  {
    id: 'https',
    label: 'Streams over HTTPS',
    required: false,
    breaks: 'Discord seeks re-download from the start instead of jumping',
    needs: n('inputProtocols', 'https')
  }
]

/** The component checks: each requirement passes when its build lists every name it needs. */
export function componentChecks(components: FfmpegComponents): SelfTestCheck[] {
  return FFMPEG_REQUIREMENTS.map((req) => {
    const missing = req.needs
      .filter(({ list, name }) =>
        Array.isArray(name)
          ? !name.some((one) => components[list].has(one))
          : !components[list].has(name)
      )
      .map(({ name }) => (Array.isArray(name) ? name.join(' or ') : name))
    return check(
      req.id,
      req.label,
      req.required,
      missing.length === 0,
      missing.length === 0
        ? 'Every component it needs is built in'
        : `Missing ${missing.join(', ')}: ${req.breaks}`
    )
  })
}

/** The effects chain the self-test runs: every knob the app offers turned, then every character effect. */
export function selfTestFilterChain(): string {
  const tone = buildAudioFilterChain({
    speed: 0.8,
    pitch: 1.25,
    bassGain: 6,
    midGain: -3,
    trebleGain: 2,
    mode: 'none'
  })
  return [tone, ...Object.values(EFFECT_FILTERS)].join(',')
}

const PCM_SECOND = Buffer.alloc(44_100 * 2 * 2)

function playbackArgs(chain: string | null): string[] {
  return [
    '-hide_banner',
    '-f',
    's16le',
    '-ar',
    '44100',
    '-ac',
    '2',
    '-i',
    'pipe:0',
    ...(chain ? ['-af', chain] : []),
    '-ar',
    '48000',
    '-ac',
    '2',
    '-f',
    's16le',
    'pipe:1'
  ]
}

function lastLine(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  return lines[lines.length - 1]?.trim() ?? ''
}

/** Runs the FFmpeg self-test on the ffmpeg and ffprobe at the given paths. */
export async function runFfmpegSelfTest(
  run: Runner,
  paths: { ffmpeg: string; ffprobe: string },
  now: number
): Promise<SelfTestReport> {
  const versionRun = await run(paths.ffmpeg, ['-hide_banner', '-version'], {
    timeoutMs: 20_000
  })
  const version = versionRun.code === 0 ? parseFfmpegVersion(versionRun.stdout) : null
  const checks = [
    check(
      'starts',
      'FFmpeg starts',
      true,
      versionRun.code === 0,
      versionRun.code === 0
        ? `Reports version ${version ?? 'unknown'}`
        : 'It did not start'
    )
  ]
  const probeRun = await run(paths.ffprobe, ['-hide_banner', '-version'], {
    timeoutMs: 20_000
  })
  checks.push(
    check(
      'ffprobe',
      'ffprobe starts',
      true,
      probeRun.code === 0,
      probeRun.code === 0 ? 'yt-dlp reads stream details with it' : 'It did not start'
    )
  )
  if (versionRun.code !== 0) return report(paths.ffmpeg, null, now, checks)

  const list = async (flag: string): Promise<string> =>
    (await run(paths.ffmpeg, ['-hide_banner', flag], { timeoutMs: 20_000 })).stdout
  const protocols = await list('-protocols')
  const components: FfmpegComponents = {
    filters: parseFilters(await list('-filters')),
    encoders: parseCodecs(await list('-encoders')),
    decoders: parseCodecs(await list('-decoders')),
    muxers: parseFormats(await list('-muxers')),
    demuxers: parseFormats(await list('-demuxers')),
    bsfs: parseBitstreamFilters(await list('-bsfs')),
    inputProtocols: parseInputProtocols(protocols)
  }
  checks.push(...componentChecks(components))

  for (const [id, label, required, chain] of [
    ['playback-run', 'Plays a second of audio the way Discord playback does', true, null],
    [
      'effects-run',
      'Runs every Discord effect on a second of audio',
      false,
      selfTestFilterChain()
    ]
  ] as const) {
    const result = await run(paths.ffmpeg, playbackArgs(chain), {
      input: PCM_SECOND,
      timeoutMs: 30_000
    })
    const ok = result.code === 0 && result.stdoutBytes > 0
    checks.push(
      check(
        id,
        label,
        required,
        ok,
        ok
          ? `${result.stdoutBytes} bytes of 48 kHz PCM`
          : lastLine(result.stderr) || 'It produced no audio'
      )
    )
  }
  return report(paths.ffmpeg, version, now, checks)
}
