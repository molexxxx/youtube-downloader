/**
 * The yt-dlp updater against temp folders, a stubbed GitHub release signed with a throwaway key, and a manual clock:
 * first install and updates are verified before an atomic swap, a failure keeps the working binary, the swap waits
 * for running yt-dlp processes and for Windows to let go of the file, and automatic checks run off the critical path
 * once a day.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { createHash } from 'crypto'
import type { YtdlpStatus } from '@shared/types'
import type { Http } from '@main/binaries/net'
import { HttpStatusError } from '@main/binaries/net'
import { verifyDetachedSignature } from '@main/binaries/ytdlp/signature'
import {
  CHECK_INTERVAL_MS,
  FIRST_CHECK_DELAY_MS,
  POLL_MS,
  PROBLEM_REASONS,
  SWAP_RETRY_MS,
  createYtdlpUpdater,
  probeVersion,
  readStored,
  type UpdaterDeps,
  type YtdlpStored,
  type YtdlpUpdater
} from '@main/binaries/ytdlp/updater'
import { createManualTimers, type ManualTimers } from './helpers/manual-timers'
import { createTestKey, signDetached, type TestKey } from './helpers/pgp'

const T0 = Date.UTC(2026, 9, 20, 12, 0, 0)
const LATEST = '2026.08.19'
const OLD = '2026.07.04'

/** A fake binary: its content names its version, which the stubbed probe reads back. */
function binary(version: string): Buffer {
  return Buffer.from(`yt-dlp ${version}`)
}

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

interface Release {
  version: string
  body: Buffer
  /** The checksum the sums file lists, when it should differ from the body's. */
  listed?: string | null
  /** Who signs the sums file. */
  signer?: TestKey
}

interface Harness {
  deps: UpdaterDeps
  updater: YtdlpUpdater
  timers: ManualTimers
  http: { [K in keyof Http]: ReturnType<typeof vi.fn> } & Http
  settings: { autoUpdate: boolean; useSystem: boolean; stored: unknown }
  system: { path: string | null }
  binDir: string
  exe: string
  events: YtdlpStatus[]
  log: {
    info: ReturnType<typeof vi.fn>
    warn: ReturnType<typeof vi.fn>
    error: ReturnType<typeof vi.fn>
  }
}

let signer: TestKey
let stranger: TestKey
let root: string

beforeAll(() => {
  signer = createTestKey()
  stranger = createTestKey()
})

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ytdlp-updater-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

function stored(settings: Harness['settings']): YtdlpStored {
  return readStored(settings.stored)
}

function harness(
  options: { release?: Release; platform?: NodeJS.Platform; arch?: string } = {}
): Harness {
  const platform = options.platform ?? 'win32'
  const exe = platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
  const asset =
    platform === 'win32'
      ? 'yt-dlp.exe'
      : platform === 'darwin'
        ? 'yt-dlp_macos'
        : 'yt-dlp_linux'
  const release = options.release ?? { version: LATEST, body: binary(LATEST) }
  const binDir = path.join(root, 'bin')
  const listed = release.listed === undefined ? sha256(release.body) : release.listed
  const sums = Buffer.from(
    `${'0'.repeat(64)}  yt-dlp_x86.exe\n${listed === null ? '' : `${listed}  ${asset}\n`}`
  )
  const signature = signDetached(sums, release.signer ?? signer)
  const http = {
    getJson: vi.fn(async () => ({
      tag_name: release.version,
      assets: [{ name: asset, size: release.body.length }]
    })),
    getBuffer: vi.fn(async (url: string) => (url.endsWith('.sig') ? signature : sums)),
    redirectTarget: vi.fn(async () => null),
    download: vi.fn(
      async (
        _url: string,
        file: string,
        opts: { onProgress(received: number, total: number | null): void }
      ) => {
        fs.writeFileSync(file, release.body, { flag: 'wx' })
        opts.onProgress(Math.floor(release.body.length / 2), release.body.length)
        opts.onProgress(release.body.length, null)
        return { bytes: release.body.length, sha256: sha256(release.body) }
      }
    )
  }
  const settings = { autoUpdate: true, useSystem: false, stored: {} as unknown }
  const system = { path: null as string | null }
  const timers = createManualTimers(T0)
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const deps: UpdaterDeps = {
    http,
    timers,
    platform,
    arch: options.arch ?? 'x64',
    binDir: () => binDir,
    probe: vi.fn(async (file: string) => {
      const match = /^yt-dlp (\S+)$/.exec(fs.readFileSync(file, 'utf8'))
      return match ? match[1] : null
    }),
    verifySignature: (data, sig) => verifyDetachedSignature(data, sig, signer.key),
    systemCopy: () => system.path,
    readSettings: () => ({
      autoUpdate: settings.autoUpdate,
      useSystem: settings.useSystem,
      stored: settings.stored
    }),
    writeStored: vi.fn((next: YtdlpStored) => {
      settings.stored = JSON.parse(JSON.stringify(next))
    }),
    rename: vi.fn((from: string, to: string) => fs.renameSync(from, to)),
    log
  }
  const updater = createYtdlpUpdater(deps)
  const events: YtdlpStatus[] = []
  updater.onStatus((status) => events.push(status))
  return {
    deps,
    updater,
    timers,
    http: http as Harness['http'],
    settings,
    system,
    binDir,
    exe,
    events,
    log
  }
}

function install(h: Harness, version: string): string {
  fs.mkdirSync(h.binDir, { recursive: true })
  const file = path.join(h.binDir, h.exe)
  fs.writeFileSync(file, binary(version))
  return file
}

function leftovers(h: Harness): string[] {
  return fs.existsSync(h.binDir)
    ? fs.readdirSync(h.binDir).filter((name) => name !== h.exe)
    : []
}

/** Lets the stubbed work and real file system calls settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('first install', () => {
  it('downloads, verifies, and installs the latest release when no yt-dlp exists', async () => {
    const h = harness()
    const file = await h.updater.ensure()
    expect(file).toBe(path.join(h.binDir, 'yt-dlp.exe'))
    expect(h.updater.path()).toBe(file)
    expect(fs.readFileSync(file, 'utf8')).toBe(`yt-dlp ${LATEST}`)
    expect(leftovers(h)).toEqual([])
    const saved = stored(h.settings)
    expect(saved.lastCheckAt).toBe(T0)
    expect(saved.installed?.version).toBe(LATEST)
    expect(saved.lastFailure).toBeNull()
    const status = await h.updater.status()
    expect(status).toMatchObject({
      installed: true,
      version: LATEST,
      path: file,
      autoUpdate: true,
      lastCheckAt: T0,
      latest: { version: LATEST, bytes: binary(LATEST).length }
    })
    expect(status.state).toEqual({ kind: 'updated', from: null, to: LATEST })
    expect(h.log.info).toHaveBeenCalledWith(`Installed yt-dlp ${LATEST}`)
    expect(h.deps.probe).toHaveBeenCalledTimes(1)
  })

  it('publishes the check, the download progress, the verify, and the result', async () => {
    const h = harness()
    await h.updater.check()
    const kindsOf = (): string[] =>
      h.events.map((e) =>
        e.state.kind === 'updating' ? `updating:${e.state.phase}` : e.state.kind
      )
    await vi.waitFor(() => expect(kindsOf()[kindsOf().length - 1]).toBe('updated'))
    const kinds = kindsOf()
    expect(kinds[0]).toBe('checking')
    expect(kinds).toContain('updating:downloading')
    expect(kinds).toContain('updating:verifying')
    const downloading = h.events.find(
      (e) => e.state.kind === 'updating' && e.state.phase === 'downloading'
    )!
    expect(downloading.state).toMatchObject({
      version: LATEST,
      totalBytes: binary(LATEST).length
    })
  })

  it('throws with the reason when the install fails, and keeps nothing half-written', async () => {
    const h = harness({
      release: { version: LATEST, body: binary(LATEST), listed: 'f'.repeat(64) }
    })
    await expect(h.updater.ensure()).rejects.toThrow(
      `yt-dlp could not be installed. ${PROBLEM_REASONS.checksum}`
    )
    expect(fs.existsSync(path.join(h.binDir, 'yt-dlp.exe'))).toBe(false)
    expect(leftovers(h)).toEqual([])
    const status = await h.updater.status()
    expect(status.installed).toBe(false)
    expect(status.state).toMatchObject({
      kind: 'failed',
      problem: 'checksum',
      reason: PROBLEM_REASONS.checksum,
      at: T0
    })
  })

  it('reports a platform yt-dlp publishes no build for', async () => {
    const h = harness({ platform: 'freebsd' })
    await expect(h.updater.ensure()).rejects.toThrow(PROBLEM_REASONS['no-build'])
    expect(h.http.getJson).not.toHaveBeenCalled()
  })

  it('looks up the latest release and its size without installing when asked to', async () => {
    const h = harness()
    const status = await h.updater.check({ install: false })
    expect(status).toMatchObject({
      installed: false,
      latest: { version: LATEST, bytes: binary(LATEST).length },
      state: { kind: 'idle' }
    })
    expect(h.http.download).not.toHaveBeenCalled()
    expect(stored(h.settings).lastCheckAt).toBeNull()
  })
})

describe('updates', () => {
  it('leaves a current copy alone and remembers its version', async () => {
    const h = harness()
    install(h, LATEST)
    const status = await h.updater.check()
    expect(status.state).toEqual({ kind: 'up-to-date' })
    expect(h.http.download).not.toHaveBeenCalled()
    expect(stored(h.settings)).toMatchObject({
      lastCheckAt: T0,
      lastFailure: null,
      installed: { version: LATEST }
    })
    await h.updater.status()
    expect(h.deps.probe).toHaveBeenCalledTimes(1)
  })

  it('replaces an older copy in place and leaves no temp file', async () => {
    const h = harness()
    const file = install(h, OLD)
    const status = await h.updater.check()
    expect(fs.readFileSync(file, 'utf8')).toBe(`yt-dlp ${LATEST}`)
    expect(status).toMatchObject({
      version: LATEST,
      state: { kind: 'updated', from: OLD, to: LATEST }
    })
    expect(leftovers(h)).toEqual([])
    const [from, to] = (h.deps.rename as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(path.dirname(from)).toBe(h.binDir)
    expect(path.basename(from)).toMatch(
      new RegExp(`^yt-dlp\\.update-${process.pid}-[0-9a-f]+\\.exe$`)
    )
    expect(to).toBe(file)
    expect(h.log.info).toHaveBeenCalledWith(`Updated yt-dlp from ${OLD} to ${LATEST}`)
  })

  it('replaces a copy that does not report its version', async () => {
    const h = harness()
    const file = install(h, OLD)
    fs.writeFileSync(file, 'garbage')
    const status = await h.updater.check()
    expect(status.state).toEqual({ kind: 'updated', from: null, to: LATEST })
    expect(fs.readFileSync(file, 'utf8')).toBe(`yt-dlp ${LATEST}`)
  })

  it('keeps the working copy when the checksum, signature, listing, or new binary fails', async () => {
    const cases: Array<[Release, string]> = [
      [{ version: LATEST, body: binary(LATEST), listed: 'e'.repeat(64) }, 'checksum'],
      [{ version: LATEST, body: binary(LATEST), signer: stranger }, 'signature'],
      [{ version: LATEST, body: binary(LATEST), listed: null }, 'no-build'],
      [{ version: LATEST, body: Buffer.from('not a program') }, 'not-starting'],
      [{ version: LATEST, body: binary('2026.08.18') }, 'not-starting']
    ]
    for (const [release, problem] of cases) {
      fs.rmSync(path.join(root, 'bin'), { recursive: true, force: true })
      const h = harness({ release })
      const file = install(h, OLD)
      const status = await h.updater.check()
      expect(status.state, problem).toMatchObject({
        kind: 'failed',
        problem,
        reason: PROBLEM_REASONS[problem as keyof typeof PROBLEM_REASONS]
      })
      expect(status.version, problem).toBe(OLD)
      expect(fs.readFileSync(file, 'utf8'), problem).toBe(`yt-dlp ${OLD}`)
      expect(leftovers(h), problem).toEqual([])
      expect(stored(h.settings), problem).toMatchObject({
        lastCheckAt: T0,
        lastFailure: { problem, at: T0 }
      })
      expect(h.log.error, problem).toHaveBeenCalled()
    }
  })

  it('does not count a check that could not reach GitHub, and remembers the failure across restarts', async () => {
    const h = harness()
    install(h, OLD)
    const reset = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
    h.http.getJson.mockRejectedValue(reset)
    h.http.redirectTarget.mockRejectedValue(reset)
    const status = await h.updater.check()
    expect(status.state).toMatchObject({ kind: 'failed', problem: 'offline' })
    expect(stored(h.settings)).toMatchObject({
      lastCheckAt: null,
      lastFailure: { problem: 'offline', at: T0 }
    })

    const restarted = createYtdlpUpdater(h.deps)
    expect((await restarted.status()).state).toEqual({
      kind: 'failed',
      problem: 'offline',
      reason: PROBLEM_REASONS.offline,
      at: T0
    })
  })

  it('does not count a download the network cut short', async () => {
    const h = harness()
    install(h, OLD)
    h.http.download.mockRejectedValue(new HttpStatusError('asset', 502))
    const status = await h.updater.check()
    expect(status.state).toMatchObject({ kind: 'failed', problem: 'server' })
    expect(stored(h.settings).lastCheckAt).toBeNull()
  })

  it('reports an unexpected failure without throwing', async () => {
    const h = harness()
    install(h, OLD)
    h.http.getBuffer.mockImplementation(async () => {
      throw new TypeError('boom')
    })
    const status = await h.updater.check()
    expect(status.state).toMatchObject({ kind: 'failed', problem: 'unknown' })
  })

  it('runs one check for callers who ask at the same time', async () => {
    const h = harness()
    install(h, OLD)
    const [a, b] = await Promise.all([h.updater.check(), h.updater.check()])
    expect(h.http.getJson).toHaveBeenCalledTimes(1)
    expect(a.version).toBe(LATEST)
    expect(b.version).toBe(LATEST)
  })

  it('installs after a lookup that was running when an install was asked for', async () => {
    const h = harness()
    const lookup = h.updater.check({ install: false })
    const installNow = h.updater.check()
    await lookup
    const status = await installNow
    expect(status.installed).toBe(true)
    expect(h.http.getJson).toHaveBeenCalledTimes(2)
    expect(h.http.download).toHaveBeenCalledTimes(1)
  })
})

describe('the swap', () => {
  it('waits until no yt-dlp process from the app runs', async () => {
    const h = harness()
    const file = install(h, OLD)
    await h.updater.status()
    const running = deferred()
    h.updater.track(running.promise)
    const checking = h.updater.check()
    await vi.waitFor(() =>
      expect(
        h.events.some((e) => e.state.kind === 'updating' && e.state.phase === 'waiting')
      ).toBe(true)
    )
    expect(fs.readFileSync(file, 'utf8')).toBe(`yt-dlp ${OLD}`)
    expect(h.deps.rename).not.toHaveBeenCalled()
    running.resolve()
    const status = await checking
    expect(status.state).toEqual({ kind: 'updated', from: OLD, to: LATEST })
    expect(fs.readFileSync(file, 'utf8')).toBe(`yt-dlp ${LATEST}`)
    expect(h.log.info).toHaveBeenCalledWith(
      `yt-dlp ${LATEST} is verified; it replaces the current copy once yt-dlp stops running`
    )
  })

  it('counts a run that fails as finished too', async () => {
    const h = harness()
    install(h, OLD)
    await h.updater.status()
    const failing = Promise.reject(new Error('yt-dlp exited 1'))
    failing.catch(() => undefined)
    h.updater.track(failing)
    const status = await h.updater.check()
    expect(status.state.kind).toBe('updated')
  })

  it('retries while Windows still holds the old binary, then succeeds', async () => {
    const h = harness()
    const file = install(h, OLD)
    const sleep = vi.fn(async () => undefined)
    h.deps.timers = { ...h.timers, sleep }
    const rename = h.deps.rename as ReturnType<typeof vi.fn>
    rename.mockImplementationOnce(() => {
      throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' })
    })
    rename.mockImplementationOnce(() => {
      throw Object.assign(new Error('EPERM'), { code: 'EPERM' })
    })
    const updater = createYtdlpUpdater(h.deps)
    const status = await updater.check()
    expect(status.state.kind).toBe('updated')
    expect(sleep.mock.calls.map((call) => (call as unknown[])[0])).toEqual([
      SWAP_RETRY_MS[0],
      SWAP_RETRY_MS[1]
    ])
    expect(fs.readFileSync(file, 'utf8')).toBe(`yt-dlp ${LATEST}`)
  })

  it('gives up after its retries, keeps the old binary, and says another program holds it', async () => {
    const h = harness()
    const file = install(h, OLD)
    h.deps.timers = { ...h.timers, sleep: vi.fn(async () => undefined) }
    ;(h.deps.rename as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw Object.assign(new Error('EACCES'), { code: 'EACCES' })
    })
    const status = await createYtdlpUpdater(h.deps).check()
    expect(status.state).toMatchObject({ kind: 'failed', problem: 'in-use' })
    expect(h.deps.rename).toHaveBeenCalledTimes(SWAP_RETRY_MS.length + 1)
    expect(fs.readFileSync(file, 'utf8')).toBe(`yt-dlp ${OLD}`)
    expect(leftovers(h)).toEqual([])
  })

  it('reads other rename failures, and held files off Windows, as disk problems', async () => {
    const h = harness()
    install(h, OLD)
    ;(h.deps.rename as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw Object.assign(new Error('EXDEV'), { code: 'EXDEV' })
    })
    expect((await h.updater.check()).state).toMatchObject({
      kind: 'failed',
      problem: 'disk'
    })

    fs.rmSync(path.join(root, 'bin'), { recursive: true, force: true })
    const linux = harness({ platform: 'linux' })
    install(linux, OLD)
    linux.deps.timers = { ...linux.timers, sleep: vi.fn(async () => undefined) }
    ;(linux.deps.rename as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw Object.assign(new Error('EACCES'), { code: 'EACCES' })
    })
    expect((await createYtdlpUpdater(linux.deps).check()).state).toMatchObject({
      kind: 'failed',
      problem: 'disk'
    })
  })

  it('marks the new binary executable off Windows', async () => {
    const h = harness({ platform: 'linux' })
    const file = install(h, OLD)
    await h.updater.check()
    expect(fs.readFileSync(file, 'utf8')).toBe(`yt-dlp ${LATEST}`)
    if (process.platform !== 'win32') {
      expect(fs.statSync(file).mode & 0o111).not.toBe(0)
    }
  })
})

describe('a copy on this computer', () => {
  function systemCopy(h: Harness, version: string): string {
    const dir = path.join(root, 'system')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, 'yt-dlp.exe')
    fs.writeFileSync(file, binary(version))
    h.system.path = file
    return file
  }

  it('is only reported while the app copy is the chosen source', async () => {
    const h = harness()
    const own = install(h, LATEST)
    systemCopy(h, OLD)
    expect(h.updater.located()).toEqual({ source: 'app', path: own })
    expect(h.updater.path()).toBe(own)
  })

  it('is used, never updated, and its version probed when chosen', async () => {
    const h = harness()
    const system = systemCopy(h, OLD)
    h.settings.useSystem = true
    expect(await h.updater.ensure()).toBe(system)
    expect(h.updater.path()).toBe(system)
    const status = await h.updater.check()
    expect(status).toMatchObject({
      installed: true,
      version: OLD,
      source: 'system',
      path: system,
      state: { kind: 'idle' }
    })
    expect(h.http.getJson).not.toHaveBeenCalled()
    expect(h.http.download).not.toHaveBeenCalled()
    expect(fs.readFileSync(system, 'utf8')).toBe(`yt-dlp ${OLD}`)
    expect(h.log.info).toHaveBeenCalledWith(
      `yt-dlp at ${system} is managed outside the app, so it is not updated`
    )
  })

  it('still answers a lookup of the latest release for setup', async () => {
    const h = harness()
    systemCopy(h, OLD)
    h.settings.useSystem = true
    const status = await h.updater.check({ install: false })
    expect(status.latest).toEqual({ version: LATEST, bytes: binary(LATEST).length })
  })

  it('gives way to the app copy, or a fresh install, when it disappears', async () => {
    const h = harness()
    h.settings.useSystem = true
    expect(h.updater.located()).toBeNull()
    const file = await h.updater.ensure()
    expect(file).toBe(path.join(h.binDir, 'yt-dlp.exe'))
    expect((await h.updater.status()).source).toBe('app')
  })

  it('is skipped by the automatic checks', async () => {
    const h = harness()
    install(h, OLD)
    systemCopy(h, OLD)
    h.settings.useSystem = true
    h.updater.start()
    await h.timers.advance(FIRST_CHECK_DELAY_MS)
    await settle()
    expect(h.http.getJson).not.toHaveBeenCalled()
    h.updater.stop()
  })
})

describe('automatic checks', () => {
  it('wait for startup to pass, then check once a day', async () => {
    const h = harness()
    install(h, OLD)
    h.updater.start()
    h.updater.start()
    await h.timers.advance(FIRST_CHECK_DELAY_MS - 1)
    expect(h.http.getJson).not.toHaveBeenCalled()
    await h.timers.advance(1)
    await vi.waitFor(() => expect(h.http.download).toHaveBeenCalledTimes(1))
    await vi.waitFor(() =>
      expect(stored(h.settings).lastCheckAt).toBe(T0 + FIRST_CHECK_DELAY_MS)
    )
    await settle()

    for (let hour = 1; hour < 24; hour++) {
      await h.timers.advance(POLL_MS)
      await settle()
    }
    expect(h.http.getJson).toHaveBeenCalledTimes(1)
    await h.timers.advance(POLL_MS)
    await vi.waitFor(() => expect(h.http.getJson).toHaveBeenCalledTimes(2))
    h.updater.stop()
    expect(h.timers.pending()).toBe(0)
  })

  it('check again hourly after the network failed', async () => {
    const h = harness()
    install(h, OLD)
    h.http.getJson.mockRejectedValueOnce(
      Object.assign(new Error('down'), { code: 'ENOTFOUND' })
    )
    h.http.redirectTarget.mockRejectedValueOnce(new Error('down'))
    h.updater.start()
    await h.timers.advance(FIRST_CHECK_DELAY_MS)
    await vi.waitFor(() =>
      expect(stored(h.settings).lastFailure?.problem).toBe('offline')
    )
    await settle()
    await h.timers.advance(POLL_MS)
    await vi.waitFor(() => expect(h.http.download).toHaveBeenCalledTimes(1))
    h.updater.stop()
  })

  it('skip when the setting is off, until it is turned on', async () => {
    const h = harness()
    install(h, OLD)
    h.settings.autoUpdate = false
    h.updater.start()
    await h.timers.advance(FIRST_CHECK_DELAY_MS)
    await settle()
    expect(h.http.getJson).not.toHaveBeenCalled()
    h.settings.autoUpdate = true
    h.updater.settingsChanged()
    await vi.waitFor(() => expect(h.http.getJson).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(h.events.some((e) => e.autoUpdate)).toBe(true))
    h.updater.stop()
  })

  it('skip a missing copy, which setup installs, and a check made within the day', async () => {
    const missing = harness()
    missing.updater.start()
    await missing.timers.advance(FIRST_CHECK_DELAY_MS)
    await settle()
    expect(missing.http.getJson).not.toHaveBeenCalled()
    missing.updater.stop()

    const recent = harness()
    install(recent, OLD)
    recent.settings.stored = {
      lastCheckAt: T0 - CHECK_INTERVAL_MS + FIRST_CHECK_DELAY_MS + 1
    }
    recent.updater.start()
    await recent.timers.advance(FIRST_CHECK_DELAY_MS)
    await settle()
    expect(recent.http.getJson).not.toHaveBeenCalled()
    recent.updater.settingsChanged()
    recent.updater.stop()
    recent.updater.settingsChanged()
  })

  it('check when the stored time lies in the future', async () => {
    const h = harness()
    install(h, OLD)
    h.settings.stored = { lastCheckAt: T0 + 10 * CHECK_INTERVAL_MS }
    h.updater.start()
    await h.timers.advance(FIRST_CHECK_DELAY_MS)
    await vi.waitFor(() => expect(h.http.getJson).toHaveBeenCalledTimes(1))
    h.updater.stop()
  })

  it('remove binaries an earlier run staged, and nothing of this run', async () => {
    const h = harness()
    install(h, OLD)
    const stale = ['yt-dlp.update-99999999-abc.exe']
    const kept = [`yt-dlp.update-${process.pid}-abc.exe`, 'notes.txt']
    for (const name of [...stale, ...kept]) {
      fs.writeFileSync(path.join(h.binDir, name), 'x')
    }
    h.settings.autoUpdate = false
    h.updater.start()
    await vi.waitFor(() => expect(leftovers(h).sort()).toEqual([...kept].sort()))
    h.updater.stop()
  })

  it('log and carry on when the settings cannot be read', async () => {
    const h = harness()
    install(h, OLD)
    h.deps.readSettings = () => {
      throw new Error('store locked')
    }
    const updater = createYtdlpUpdater(h.deps)
    updater.onStatus(() => undefined)
    updater.start()
    await h.timers.advance(FIRST_CHECK_DELAY_MS)
    await vi.waitFor(() =>
      expect(h.log.warn).toHaveBeenCalledWith(
        'The automatic yt-dlp check stopped: store locked'
      )
    )
    updater.settingsChanged()
    await vi.waitFor(() =>
      expect(h.log.warn).toHaveBeenCalledWith(
        'Could not read the yt-dlp status: store locked'
      )
    )
    updater.stop()
  })
})

describe('status and storage', () => {
  it('carries the latest only after a check, and stops sending to a removed listener', async () => {
    const h = harness()
    install(h, LATEST)
    expect((await h.updater.status()).latest).toBeNull()
    const seen: YtdlpStatus[] = []
    const stop = h.updater.onStatus((status) => seen.push(status))
    await h.updater.check()
    await settle()
    expect(seen.length).toBeGreaterThan(0)
    stop()
    const count = seen.length
    await h.updater.check()
    await settle()
    expect(seen).toHaveLength(count)
  })

  it('logs a store that cannot be written, and still installs', async () => {
    const h = harness()
    const file = install(h, OLD)
    ;(h.deps.writeStored as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('read-only store')
    })
    const status = await h.updater.check()
    expect(status.state).toEqual({ kind: 'updated', from: OLD, to: LATEST })
    expect(fs.readFileSync(file, 'utf8')).toBe(`yt-dlp ${LATEST}`)
    expect(h.log.warn).toHaveBeenCalledWith(
      'Could not record the yt-dlp state: read-only store'
    )
  })

  it('reads the stored state and drops what it cannot use', () => {
    expect(readStored(undefined)).toEqual({
      lastCheckAt: null,
      installed: null,
      lastFailure: null
    })
    expect(
      readStored({
        lastCheckAt: 'yesterday',
        installed: { version: 'x', size: 1, mtimeMs: 2 },
        lastFailure: { problem: 'gremlins', at: 3 }
      })
    ).toEqual({ lastCheckAt: null, installed: null, lastFailure: null })
    expect(
      readStored({
        lastCheckAt: 5,
        installed: { version: LATEST, size: 1, mtimeMs: 2.5 },
        lastFailure: { problem: 'disk', at: 3 }
      })
    ).toEqual({
      lastCheckAt: 5,
      installed: { version: LATEST, size: 1, mtimeMs: 2.5 },
      lastFailure: { problem: 'disk', at: 3 }
    })
    expect(
      readStored({
        installed: { version: LATEST, size: '1', mtimeMs: 2 },
        lastFailure: { problem: 'disk' }
      })
    ).toEqual({ lastCheckAt: null, installed: null, lastFailure: null })
  })
})

describe('probeVersion', () => {
  it('reads the version a program prints, and null when it fails or prints none', async () => {
    await expect(
      probeVersion(process.execPath, ['-e', 'console.log("2026.08.19")'])
    ).resolves.toBe('2026.08.19')
    await expect(
      probeVersion(process.execPath, ['-e', 'console.log("hello")'])
    ).resolves.toBeNull()
    await expect(
      probeVersion(process.execPath, ['-e', 'process.exit(3)'])
    ).resolves.toBeNull()
    await expect(probeVersion(path.join(root, 'missing.exe'))).resolves.toBeNull()
  })
})
