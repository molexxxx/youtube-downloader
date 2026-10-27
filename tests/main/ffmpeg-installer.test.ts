/**
 * The FFmpeg installer against temp folders, a stubbed network serving fake archives whose digests the test pins,
 * and a manual clock: verified installs into a build folder, the fallback after the primary vanished, nothing
 * half-installed on any failure, and the background upgrade from an older or legacy build.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { createHash } from 'crypto'
import type { FfmpegStatus } from '@shared/types'
import { HttpStatusError, type Http } from '@main/binaries/net'
import { parsePin, type Asset } from '@main/binaries/ffmpeg/pin'
import {
  CHECKSUM_MESSAGE,
  FIRST_RUN_DELAY_MS,
  RETRY_MS,
  createFfmpegInstaller,
  type InstallerDeps
} from '@main/binaries/ffmpeg/installer'
import { createManualTimers, type ManualTimers } from './helpers/manual-timers'

const PRIMARY_ID = 'btbn-n9.0.2-17-g2a571b6068'
const FALLBACK_ID = 'gyan-9.0.2-full'
const PRIMARY_URL = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/t/p.zip'
const FALLBACK_URL = 'https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/f.zip'

/** A fake archive: the files it holds, as JSON, which the stubbed extractor writes out. */
function archive(files: Record<string, string>): Buffer {
  return Buffer.from(JSON.stringify(files))
}

const GOOD = archive({
  'ffmpeg-n9.0.2/bin/ffmpeg.exe': 'ffmpeg 9.0.2',
  'ffmpeg-n9.0.2/bin/ffprobe.exe': 'ffprobe 9.0.2',
  'ffmpeg-n9.0.2/bin/ffplay.exe': 'ffplay'
})

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

function pinned(build: string, url: string, body: Buffer, kind: Asset['kind'] = 'zip') {
  return {
    build,
    url,
    bytes: body.length,
    sha256: sha256(body),
    kind,
    contains: ['ffmpeg', 'ffprobe']
  }
}

interface Harness {
  deps: InstallerDeps
  timers: ManualTimers
  http: { download: ReturnType<typeof vi.fn> } & Http
  root: string
  legacy: string
  tmp: string
  events: FfmpegStatus[]
  served: Map<string, Buffer | number>
  log: {
    info: ReturnType<typeof vi.fn>
    warn: ReturnType<typeof vi.fn>
    error: ReturnType<typeof vi.fn>
  }
}

let base: string

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'ffmpeg-installer-'))
})

afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true })
})

function harness(options: { kind?: Asset['kind']; pinnedBody?: Buffer } = {}): Harness {
  const own = fs.mkdtempSync(path.join(base, 'harness-'))
  const root = path.join(own, 'ffmpeg')
  const legacy = path.join(own, 'bin')
  const tmp = path.join(own, 'tmp')
  fs.mkdirSync(tmp, { recursive: true })
  const pinnedBody = options.pinnedBody ?? GOOD
  const pin = parsePin({
    id: '9.0.2-2026-09-30',
    version: '9.0.2',
    fetched: '2026-10-27',
    platforms: {
      'win32-x64': {
        primary: [pinned(PRIMARY_ID, PRIMARY_URL, pinnedBody, options.kind)],
        fallback: [pinned(FALLBACK_ID, FALLBACK_URL, GOOD)]
      }
    }
  })
  const served = new Map<string, Buffer | number>([
    [PRIMARY_URL, GOOD],
    [FALLBACK_URL, GOOD]
  ])
  const http = {
    getJson: vi.fn(),
    getBuffer: vi.fn(),
    redirectTarget: vi.fn(),
    download: vi.fn(
      async (
        url: string,
        file: string,
        opts: {
          maxBytes: number
          onProgress(received: number, total: number | null): void
        }
      ) => {
        const body = served.get(url)
        if (typeof body === 'number') throw new HttpStatusError(`${url}?redirected`, body)
        if (!body)
          throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
        fs.writeFileSync(file, body, { flag: 'wx' })
        opts.onProgress(body.length, body.length)
        return { bytes: body.length, sha256: sha256(body) }
      }
    )
  }
  const extract = async (
    file: string,
    dest: string,
    wanted: (name: string) => boolean = () => true
  ) => {
    const files = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>
    for (const [name, content] of Object.entries(files)) {
      if (!wanted(path.posix.basename(name))) continue
      fs.mkdirSync(path.dirname(path.join(dest, name)), { recursive: true })
      fs.writeFileSync(path.join(dest, name), content)
    }
  }
  const timers = createManualTimers(Date.UTC(2026, 9, 27))
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const deps: InstallerDeps = {
    http,
    timers,
    platform: 'win32',
    arch: 'x64',
    pin,
    root: () => root,
    legacyDir: () => legacy,
    useSystem: () => false,
    systemDir: () => null,
    tmpDir: () => tmp,
    runs: vi.fn(async (file: string) => fs.readFileSync(file, 'utf8').endsWith('9.0.2')),
    extractZip: vi.fn(extract),
    extractTarXz: vi.fn((file: string, dest: string) => extract(file, dest)),
    log
  }
  const events: FfmpegStatus[] = []
  return {
    deps,
    timers,
    http: http as Harness['http'],
    root,
    legacy,
    tmp,
    events,
    served,
    log
  }
}

function installer(h: Harness) {
  const created = createFfmpegInstaller(h.deps)
  created.onStatus((status) => h.events.push(status))
  return created
}

function place(dir: string, version = 'old'): void {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'ffmpeg.exe'), `ffmpeg ${version}`)
  fs.writeFileSync(path.join(dir, 'ffprobe.exe'), `ffprobe ${version}`)
}

async function settle(): Promise<void> {
  for (let i = 0; i < 30; i++) await new Promise((resolve) => setImmediate(resolve))
}

describe('ensure', () => {
  it('installs the pinned primary build, verified, with only ffmpeg and ffprobe', async () => {
    const h = harness()
    const ffmpeg = installer(h)
    await ffmpeg.ensure()
    const folder = path.join(h.root, PRIMARY_ID)
    expect(fs.readdirSync(folder).sort()).toEqual(['ffmpeg.exe', 'ffprobe.exe'])
    expect(fs.readdirSync(h.root)).toEqual([PRIMARY_ID])
    expect(fs.readdirSync(h.tmp)).toEqual([])
    expect(h.http.download.mock.calls[0][2].maxBytes).toBe(GOOD.length)
    expect(ffmpeg.dir()).toBe(folder)
    expect(ffmpeg.status()).toMatchObject({
      installed: true,
      version: '9.0.2',
      build: PRIMARY_ID,
      path: path.join(folder, 'ffmpeg.exe'),
      pinned: {
        version: '9.0.2',
        build: PRIMARY_ID,
        bytes: GOOD.length,
        publisher: 'BtbN FFmpeg Builds'
      },
      state: { kind: 'idle' }
    })
    const phases = h.events.map((e) =>
      e.state.kind === 'installing' ? e.state.phase : e.state.kind
    )
    expect(phases[0]).toBe('downloading')
    expect(phases).toContain('extracting')
    expect(phases).toContain('verifying')
    expect(phases[phases.length - 1]).toBe('idle')
  })

  it('does nothing when the pinned build is installed, and shares one install between callers', async () => {
    const h = harness()
    const ffmpeg = installer(h)
    await Promise.all([ffmpeg.ensure(), ffmpeg.ensure()])
    expect(h.http.download).toHaveBeenCalledTimes(1)
    await ffmpeg.ensure()
    expect(h.http.download).toHaveBeenCalledTimes(1)
  })

  it('discards a download that does not match the pin and installs nothing', async () => {
    const h = harness()
    h.served.set(PRIMARY_URL, archive({ 'evil/ffmpeg.exe': 'ffmpeg 9.0.2' }))
    const ffmpeg = installer(h)
    await expect(ffmpeg.ensure()).rejects.toThrow(CHECKSUM_MESSAGE)
    expect(fs.readdirSync(h.root)).toEqual([])
    expect(fs.readdirSync(h.tmp)).toEqual([])
    expect(h.deps.extractZip).not.toHaveBeenCalled()
    expect(ffmpeg.status()).toMatchObject({
      installed: false,
      state: { kind: 'failed', reason: CHECKSUM_MESSAGE }
    })
  })

  it('falls back after the primary build is gone, keyed on the pinned URL', async () => {
    const h = harness()
    h.served.set(PRIMARY_URL, 404)
    const ffmpeg = installer(h)
    await ffmpeg.ensure()
    expect(fs.readdirSync(h.root)).toEqual([FALLBACK_ID])
    expect(ffmpeg.status()).toMatchObject({ build: FALLBACK_ID, version: '9.0.2' })
    expect(h.log.warn).toHaveBeenCalledWith(
      `FFmpeg primary download answered 404: ${PRIMARY_URL}`
    )
  })

  it('does not fall back on a server error, and says so when both builds are gone', async () => {
    const h = harness()
    h.served.set(PRIMARY_URL, 503)
    await expect(installer(h).ensure()).rejects.toThrow(/status 503/)
    expect(h.http.download).toHaveBeenCalledTimes(1)

    const gone = harness()
    gone.served.set(PRIMARY_URL, 404)
    gone.served.set(FALLBACK_URL, 410)
    await expect(installer(gone).ensure()).rejects.toThrow(
      'No pinned FFmpeg 9.0.2 build can be downloaded right now'
    )
  })

  it('keeps nothing when the extracted binaries do not start, or one is missing', async () => {
    const broken = archive({ 'b/ffmpeg.exe': 'ffmpeg 1', 'b/ffprobe.exe': 'ffprobe 1' })
    const h = harness({ pinnedBody: broken })
    h.served.set(PRIMARY_URL, broken)
    await expect(installer(h).ensure()).rejects.toThrow('ffmpeg.exe did not start')
    expect(fs.readdirSync(h.root)).toEqual([])

    const partial = archive({ 'b/ffmpeg.exe': 'ffmpeg 9.0.2' })
    const p = harness({ pinnedBody: partial })
    p.served.set(PRIMARY_URL, partial)
    await expect(installer(p).ensure()).rejects.toThrow('holds no ffprobe.exe')
    expect(fs.readdirSync(p.root)).toEqual([])
  })

  it('extracts a tar.xz build with tar', async () => {
    const h = harness({ kind: 'tar.xz' })
    await installer(h).ensure()
    expect(h.deps.extractTarXz).toHaveBeenCalledTimes(1)
    expect(h.deps.extractZip).not.toHaveBeenCalled()
  })

  it('replaces a broken folder of the pinned build', async () => {
    const h = harness()
    fs.mkdirSync(path.join(h.root, PRIMARY_ID), { recursive: true })
    fs.writeFileSync(path.join(h.root, PRIMARY_ID, 'ffmpeg.exe'), 'half')
    await installer(h).ensure()
    expect(fs.readdirSync(path.join(h.root, PRIMARY_ID)).sort()).toEqual([
      'ffmpeg.exe',
      'ffprobe.exe'
    ])
  })

  it('reports a platform the pin has no build for', async () => {
    const h = harness()
    h.deps.arch = 'riscv64'
    const ffmpeg = installer(h)
    expect(ffmpeg.status().pinned).toBeNull()
    await expect(ffmpeg.ensure()).rejects.toThrow(
      'pins no FFmpeg build for win32-riscv64'
    )
  })
})

describe('the build in use', () => {
  it('prefers the pinned build, then the newest older build, then the legacy folder', () => {
    const h = harness()
    const ffmpeg = installer(h)
    expect(ffmpeg.status()).toMatchObject({
      installed: false,
      version: null,
      build: null,
      path: null
    })
    expect(ffmpeg.dir()).toBe(path.join(h.root, PRIMARY_ID))

    place(h.legacy)
    expect(ffmpeg.status()).toMatchObject({ installed: true, version: null, build: null })
    expect(ffmpeg.dir()).toBe(h.legacy)

    place(path.join(h.root, 'btbn-n7.1-3-gabc'))
    place(path.join(h.root, 'btbn-n8.0.1-5-gdef'))
    expect(ffmpeg.status()).toMatchObject({
      version: '8.0.1',
      build: 'btbn-n8.0.1-5-gdef'
    })

    place(path.join(h.root, FALLBACK_ID), '9.0.2')
    expect(ffmpeg.status()).toMatchObject({ version: '9.0.2', build: FALLBACK_ID })
  })
})

describe('a build on this computer', () => {
  function withSystem(h: Harness, chosen: { on: boolean }): string {
    const dir = path.join(base, 'system')
    place(dir, 'system')
    h.deps.useSystem = () => chosen.on
    h.deps.systemDir = () => (fs.existsSync(dir) ? dir : null)
    return dir
  }

  it('is used while chosen, and the app builds while not', () => {
    const h = harness()
    const chosen = { on: true }
    const dir = withSystem(h, chosen)
    place(path.join(h.root, PRIMARY_ID), '9.0.2')
    const ffmpeg = installer(h)
    expect(ffmpeg.dir()).toBe(dir)
    expect(ffmpeg.status()).toMatchObject({
      installed: true,
      source: 'system',
      build: null
    })
    chosen.on = false
    expect(ffmpeg.status()).toMatchObject({ source: 'app', build: PRIMARY_ID })
  })

  it('downloads nothing and deletes no app build while in use', async () => {
    const h = harness()
    withSystem(h, { on: true })
    place(path.join(h.root, 'btbn-n8.0-1-gabc'))
    const ffmpeg = installer(h)
    ffmpeg.start()
    await h.timers.advance(FIRST_RUN_DELAY_MS)
    await settle()
    expect(h.http.download).not.toHaveBeenCalled()
    expect(fs.readdirSync(h.root)).toEqual(['btbn-n8.0-1-gabc'])
    ffmpeg.stop()
  })

  it('installs the pinned build when switched back to the app with an older one in place', async () => {
    const h = harness()
    const chosen = { on: true }
    withSystem(h, chosen)
    place(path.join(h.root, 'btbn-n8.0-1-gabc'))
    const ffmpeg = installer(h)
    ffmpeg.start()
    await h.timers.advance(FIRST_RUN_DELAY_MS)
    await settle()
    chosen.on = false
    ffmpeg.settingsChanged()
    await vi.waitFor(() => expect(fs.readdirSync(h.root)).toEqual([PRIMARY_ID]))
    expect(h.events[h.events.length - 1]).toMatchObject({
      source: 'app',
      build: PRIMARY_ID
    })
    ffmpeg.stop()
  })
})

describe('background work', () => {
  it('waits for startup, then upgrades an older build and removes what it replaced', async () => {
    const h = harness()
    place(h.legacy)
    fs.writeFileSync(path.join(h.legacy, 'yt-dlp.exe'), 'kept')
    place(path.join(h.root, 'btbn-n8.0-1-gabc'))
    fs.mkdirSync(path.join(h.root, `${PRIMARY_ID}.part-dead`))
    const ffmpeg = installer(h)
    ffmpeg.start()
    ffmpeg.start()
    await h.timers.advance(FIRST_RUN_DELAY_MS - 1)
    expect(h.http.download).not.toHaveBeenCalled()
    await h.timers.advance(1)
    await vi.waitFor(() => expect(fs.readdirSync(h.root)).toEqual([PRIMARY_ID]))
    await vi.waitFor(() => expect(fs.readdirSync(h.legacy)).toEqual(['yt-dlp.exe']))
    expect(ffmpeg.status()).toMatchObject({ build: PRIMARY_ID })
    ffmpeg.stop()
  })

  it('removes the legacy folder once it is empty', async () => {
    const h = harness()
    place(h.legacy)
    const ffmpeg = installer(h)
    ffmpeg.start()
    await h.timers.advance(FIRST_RUN_DELAY_MS)
    await vi.waitFor(() => expect(fs.existsSync(h.legacy)).toBe(false))
    ffmpeg.stop()
  })

  it('leaves a first install to setup, and keeps older builds while the upgrade fails', async () => {
    const empty = harness()
    const none = installer(empty)
    none.start()
    await empty.timers.advance(FIRST_RUN_DELAY_MS)
    await settle()
    expect(empty.http.download).not.toHaveBeenCalled()
    none.stop()

    const h = harness()
    place(path.join(h.root, 'btbn-n8.0-1-gabc'))
    h.served.set(PRIMARY_URL, 503)
    const ffmpeg = installer(h)
    ffmpeg.start()
    await h.timers.advance(FIRST_RUN_DELAY_MS)
    await vi.waitFor(() => expect(ffmpeg.status().state.kind).toBe('failed'))
    expect(fs.readdirSync(h.root)).toEqual(['btbn-n8.0-1-gabc'])
    expect(ffmpeg.dir()).toBe(path.join(h.root, 'btbn-n8.0-1-gabc'))

    h.served.set(PRIMARY_URL, GOOD)
    await h.timers.advance(RETRY_MS)
    await vi.waitFor(() => expect(fs.readdirSync(h.root)).toEqual([PRIMARY_ID]))
    ffmpeg.stop()
    expect(h.timers.pending()).toBe(0)
  })
})
