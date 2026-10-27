/**
 * The yt-dlp the app runs: where it is, which version it is, and keeping it current.
 *
 * The app downloads the standalone build of yt-dlp's stable channel into `<userData>/ytdlp-bin` and replaces it
 * itself instead of running `yt-dlp -U`. Every install, the first one included, must match the SHA-256 that the
 * release's SHA2-256SUMS lists, that file must carry a valid signature by the yt-dlp signing key, and the new binary
 * must start and report the release's version. Only then does a rename in the same folder replace the working
 * binary, once no yt-dlp process this app started is running, so a failed update always keeps the working copy.
 *
 * Automatic checks stay off the critical path: the first runs a short while after startup, then one runs every hour,
 * and each goes ahead only when the setting is on and the last check reached GitHub over a day ago.
 */
import * as fs from 'fs'
import * as path from 'path'
import { execFile } from 'child_process'
import { randomBytes } from 'crypto'
import type {
  BinarySource,
  YtdlpProblem,
  YtdlpStatus,
  YtdlpUpdateState
} from '@shared/types'
import type { Http } from '../net'
import type { TimerHandle, Timers } from '../timers'
import {
  assetFor,
  checksumFor,
  compareVersions,
  executableName,
  fetchSignedSums,
  parseVersion,
  problemOf,
  queryLatest,
  releaseFileUrl,
  YtdlpUpdateError,
  type LatestRelease
} from './release'
import type { SignatureCheck } from './signature'

/** How long after a check that reached GitHub the next automatic one waits. */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

/** How long after startup the first automatic check waits, so it never competes with startup. */
export const FIRST_CHECK_DELAY_MS = 15_000

/** How often a running app looks whether a check is due. */
export const POLL_MS = 60 * 60 * 1000

/** The largest binary a download may be; the standalone builds are 18 to 42 MB. */
export const MAX_BINARY_BYTES = 256 * 1024 * 1024

/** The waits between attempts at the swap while Windows still holds the old binary after its process ended. */
export const SWAP_RETRY_MS: readonly number[] = [250, 500, 1000, 2000, 4000]

const PROGRESS_INTERVAL_MS = 200
const STAGE_PREFIX = 'yt-dlp.update-'

/** What each problem means for the user, and the way out. */
export const PROBLEM_REASONS: Readonly<Record<YtdlpProblem, string>> = {
  offline: 'GitHub could not be reached. Check your internet connection, then try again.',
  'rate-limited':
    'GitHub is limiting update checks from this network right now. Try again in an hour.',
  server: 'GitHub did not send the yt-dlp release. Try again later.',
  'no-build': 'yt-dlp publishes no standalone build for this computer.',
  checksum:
    'The download did not match the checksum yt-dlp published, so it was discarded. Try again later.',
  signature:
    'The release checksums are not signed by the yt-dlp signing key, so nothing was installed. Try again later, or update the app.',
  'not-starting':
    'The new yt-dlp did not start on this computer, so the current one was kept. Try again later.',
  'in-use':
    'Another program kept yt-dlp open, so the new version could not replace it. Close programs that use yt-dlp, then try again.',
  disk: 'The yt-dlp folder could not be written. Check that the disk has free space and the folder is not read-only, then try again.',
  unknown: 'The update stopped unexpectedly, and the log has the details. Try again.'
}

const PROBLEMS = Object.keys(PROBLEM_REASONS) as YtdlpProblem[]

/** Problems the next hourly look retries, since the network rather than the release caused them. */
const TRANSIENT_PROBLEMS: ReadonlySet<YtdlpProblem> = new Set<YtdlpProblem>([
  'offline',
  'server',
  'rate-limited'
])

/** What the updater persists between runs. */
export interface YtdlpStored {
  lastCheckAt: number | null
  installed: { version: string; size: number; mtimeMs: number } | null
  lastFailure: { problem: YtdlpProblem; at: number } | null
}

/** What the updater reads and runs; tests pass temp folders, a stubbed network, and a manual clock. */
export interface UpdaterDeps {
  http: Http
  timers: Timers
  platform: NodeJS.Platform
  arch: string
  binDir(): string
  /** Runs `yt-dlp --version` and answers the version, or null when it does not start or prints none. */
  probe(file: string): Promise<string | null>
  verifySignature(data: Buffer, signature: Buffer): SignatureCheck
  /** The yt-dlp found on this computer, outside the app's folders, or null. */
  systemCopy(): string | null
  readSettings(): { autoUpdate: boolean; useSystem: boolean; stored: unknown }
  writeStored(next: YtdlpStored): void
  rename(from: string, to: string): void
  log: {
    info(...parts: unknown[]): void
    warn(...parts: unknown[]): void
    error(...parts: unknown[]): void
  }
}

/** The yt-dlp updater's surface for the binary paths, the IPC handlers, and the app lifecycle. */
export interface YtdlpUpdater {
  /** The yt-dlp to run: the copy in use, else where the app's copy is installed. */
  path(): string
  /** The copy in use: the one on this computer while that source is chosen and it exists, else the app's own. */
  located(): { source: BinarySource; path: string } | null
  /** The status Settings shows; reads the version of the installed copy, running it once when the version is unknown. */
  status(): Promise<YtdlpStatus>
  /** Checks now and, unless `install` is false, installs a newer or missing copy. Never throws; joins a check in progress. */
  check(options?: { install?: boolean }): Promise<YtdlpStatus>
  /** The installed copy, or a verified download of the latest release when none is installed. */
  ensure(): Promise<string>
  /** Counts a yt-dlp process from this app until `run` settles, so a swap waits for it. */
  track<T extends PromiseLike<unknown>>(run: T): T
  /** Starts the automatic checks; a second call does nothing. */
  start(): void
  stop(): void
  /** Announces the status after the setting was saved, and runs a due check when it was turned on. */
  settingsChanged(): void
  onStatus(listener: (status: YtdlpStatus) => void): () => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** The stored state, with anything unusable read as absent. */
export function readStored(value: unknown): YtdlpStored {
  const record = isRecord(value) ? value : {}
  const installed = isRecord(record.installed) ? record.installed : null
  const failure = isRecord(record.lastFailure) ? record.lastFailure : null
  const version =
    typeof installed?.version === 'string' ? parseVersion(installed.version) : null
  const size = finite(installed?.size)
  const mtimeMs = finite(installed?.mtimeMs)
  const at = finite(failure?.at)
  return {
    lastCheckAt: finite(record.lastCheckAt),
    installed:
      version !== null && size !== null && mtimeMs !== null
        ? { version, size, mtimeMs }
        : null,
    lastFailure:
      at !== null && PROBLEMS.includes(failure?.problem as YtdlpProblem)
        ? { problem: failure!.problem as YtdlpProblem, at }
        : null
  }
}

/** Runs a yt-dlp binary and reads the version it prints; null when it fails, times out, or prints none. */
export function probeVersion(
  file: string,
  args: readonly string[] = ['--ignore-config', '--version'],
  timeoutMs = 60_000
): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      file,
      [...args],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 64 * 1024 },
      (err, stdout) => {
        resolve(err ? null : parseVersion(String(stdout)))
      }
    )
  })
}

function failedState(problem: YtdlpProblem, at: number): YtdlpUpdateState {
  return { kind: 'failed', problem, reason: PROBLEM_REASONS[problem], at }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** The updater over `deps`. */
export function createYtdlpUpdater(deps: UpdaterDeps): YtdlpUpdater {
  const exe = executableName(deps.platform)
  const asset = assetFor(deps.platform, deps.arch)
  const listeners = new Set<(status: YtdlpStatus) => void>()
  let state: YtdlpUpdateState | null = null
  let latest: LatestRelease | null = null
  let job: Promise<void> | null = null
  let jobInstalls = false
  let active = 0
  let idleWaiters: (() => void)[] = []
  let timer: TimerHandle | null = null
  let started = false
  let lastProgressAt = Number.NEGATIVE_INFINITY
  let publishChain: Promise<void> = Promise.resolve()
  let probing: { key: string; version: Promise<string | null> } | null = null
  let systemProbe: { key: string; version: Promise<string | null> } | null = null

  const target = (): string => path.join(deps.binDir(), exe)

  function settings(): { autoUpdate: boolean; useSystem: boolean; stored: YtdlpStored } {
    const raw = deps.readSettings()
    return {
      autoUpdate: raw.autoUpdate,
      useSystem: raw.useSystem,
      stored: readStored(raw.stored)
    }
  }

  function isFile(file: string): boolean {
    try {
      return fs.statSync(file).isFile()
    } catch {
      return false
    }
  }

  function located(): { source: BinarySource; path: string } | null {
    if (settings().useSystem) {
      const system = deps.systemCopy()
      if (system !== null) return { source: 'system', path: system }
    }
    return isFile(target()) ? { source: 'app', path: target() } : null
  }

  function store(patch: Partial<YtdlpStored>): void {
    try {
      deps.writeStored({ ...settings().stored, ...patch })
    } catch (err) {
      deps.log.warn(`Could not record the yt-dlp state: ${messageOf(err)}`)
    }
  }

  function stateFrom(
    stored: YtdlpStored,
    current: YtdlpUpdateState | null
  ): YtdlpUpdateState {
    if (current !== null) {
      return current
    }
    return stored.lastFailure
      ? failedState(stored.lastFailure.problem, stored.lastFailure.at)
      : { kind: 'idle' }
  }

  async function statOf(file: string): Promise<fs.Stats | null> {
    try {
      const stat = await fs.promises.stat(file)
      return stat.isFile() ? stat : null
    } catch {
      return null
    }
  }

  async function installed(): Promise<string | null> {
    const own = target()
    return (await statOf(own)) ? own : null
  }

  function track<T extends PromiseLike<unknown>>(run: T): T {
    active++
    let settled = false
    const done = (): void => {
      if (settled) {
        return
      }
      settled = true
      active--
      if (active === 0) {
        const waiters = idleWaiters
        idleWaiters = []
        for (const resolve of waiters) {
          resolve()
        }
      }
    }
    run.then(done, done)
    return run
  }

  function whenIdle(): Promise<void> {
    return active === 0
      ? Promise.resolve()
      : new Promise((resolve) => idleWaiters.push(resolve))
  }

  /** The installed copy's version: the stored one while the file is the one it was read from, else what the binary reports. */
  async function installedVersion(file: string): Promise<string | null> {
    const stat = await statOf(file)
    if (stat === null) {
      return null
    }
    const known = settings().stored.installed
    if (known && known.size === stat.size && known.mtimeMs === stat.mtimeMs) {
      return known.version
    }
    const key = `${stat.size}:${stat.mtimeMs}`
    if (probing?.key !== key) {
      const version = track(deps.probe(file)).then((reported) => {
        if (reported !== null) {
          store({
            installed: { version: reported, size: stat.size, mtimeMs: stat.mtimeMs }
          })
        }
        return reported
      })
      probing = { key, version }
    }
    return probing.version
  }

  /** A system copy's version, probed once per file identity; pip, Homebrew, or winget may replace it at any time. */
  async function systemVersion(file: string): Promise<string | null> {
    const stat = await statOf(file)
    const key = `${file}:${stat?.size}:${stat?.mtimeMs}`
    if (systemProbe?.key !== key) {
      systemProbe = { key, version: track(deps.probe(file)) }
    }
    return systemProbe.version
  }

  /** The status with `snapshot` as its state, which defaults to the state now. */
  async function status(snapshot: YtdlpUpdateState | null = state): Promise<YtdlpStatus> {
    const { autoUpdate, stored } = settings()
    const found = located()
    return {
      installed: found !== null,
      version:
        found === null
          ? null
          : found.source === 'app'
            ? await installedVersion(found.path)
            : await systemVersion(found.path),
      path: found?.path ?? null,
      source: found?.source ?? null,
      selfTest: null,
      autoUpdate,
      lastCheckAt: stored.lastCheckAt,
      latest: latest === null ? null : { ...latest },
      state: stateFrom(stored, snapshot)
    }
  }

  /** Sends the status to every listener, one publish after another, each with the state it was made with. */
  function publish(): void {
    if (listeners.size === 0) {
      return
    }
    const snapshot = state
    publishChain = publishChain.then(async () => {
      try {
        const next = await status(snapshot)
        for (const listener of listeners) {
          listener(next)
        }
      } catch (err) {
        deps.log.warn(`Could not read the yt-dlp status: ${messageOf(err)}`)
      }
    })
  }

  function setState(next: YtdlpUpdateState): void {
    state = next
    publish()
  }

  function progress(
    phase: 'downloading' | 'verifying' | 'waiting',
    version: string,
    receivedBytes: number,
    totalBytes: number | null,
    force: boolean
  ): void {
    state = { kind: 'updating', phase, version, receivedBytes, totalBytes }
    const now = deps.timers.now()
    if (force || now - lastProgressAt >= PROGRESS_INTERVAL_MS) {
      lastProgressAt = now
      publish()
    }
  }

  /**
   * Reports a failure and keeps it until a check succeeds. A failure after the release was found counts as a check,
   * so the hourly look waits a day before downloading again, unless the network let it down.
   */
  function fail(err: unknown, afterLookup: boolean): void {
    const problem = problemOf(err)
    const at = deps.timers.now()
    deps.log.error(`yt-dlp update failed: ${messageOf(err)}`)
    setState(failedState(problem, at))
    const lastFailure = { problem, at }
    const counts = afterLookup && !TRANSIENT_PROBLEMS.has(problem)
    store(counts ? { lastCheckAt: at, lastFailure } : { lastFailure })
  }

  /** Renames the verified binary over the working one once nothing runs it, retrying while Windows still holds it. */
  async function swapIn(staged: string, version: string, bytes: number): Promise<void> {
    let announced = false
    for (let attempt = 0; ; attempt++) {
      while (active > 0) {
        progress('waiting', version, bytes, bytes, true)
        if (!announced) {
          announced = true
          deps.log.info(
            `yt-dlp ${version} is verified; it replaces the current copy once yt-dlp stops running`
          )
        }
        await whenIdle()
      }
      try {
        deps.rename(staged, target())
        return
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        const held = code === 'EBUSY' || code === 'EPERM' || code === 'EACCES'
        if (!held || attempt >= SWAP_RETRY_MS.length) {
          throw new YtdlpUpdateError(
            held && deps.platform === 'win32' ? 'in-use' : 'disk',
            `Could not replace ${target()}: ${messageOf(err)}`
          )
        }
        await deps.timers.sleep(SWAP_RETRY_MS[attempt])
      }
    }
  }

  async function installRelease(
    release: LatestRelease,
    name: string,
    current: string | null
  ): Promise<void> {
    const version = release.version
    const dir = deps.binDir()
    await fs.promises.mkdir(dir, { recursive: true })
    progress('downloading', version, 0, release.bytes, true)
    const sums = await fetchSignedSums(deps.http, version, deps.verifySignature)
    const expected = checksumFor(sums, name)
    if (expected === null) {
      throw new YtdlpUpdateError(
        'no-build',
        `The checksums of yt-dlp ${version} list no ${name}`
      )
    }
    const staged = path.join(
      dir,
      `${STAGE_PREFIX}${process.pid}-${randomBytes(6).toString('hex')}${deps.platform === 'win32' ? '.exe' : ''}`
    )
    deps.log.info(`Downloading yt-dlp ${version} (${name})`)
    try {
      const got = await deps.http.download(releaseFileUrl(version, name), staged, {
        maxBytes: MAX_BINARY_BYTES,
        onProgress: (received, total) =>
          progress('downloading', version, received, total ?? release.bytes, false)
      })
      progress('verifying', version, got.bytes, got.bytes, true)
      if (got.sha256 !== expected) {
        throw new YtdlpUpdateError(
          'checksum',
          `${name} ${version}: expected SHA-256 ${expected}, received ${got.sha256}`
        )
      }
      deps.log.info(
        `Verified ${name} ${version}: ${got.bytes} bytes, SHA-256 ${got.sha256}, from checksums signed by the yt-dlp signing key`
      )
      if (deps.platform !== 'win32') {
        await fs.promises.chmod(staged, 0o755)
      }
      const reported = await deps.probe(staged)
      if (reported !== version) {
        throw new YtdlpUpdateError(
          'not-starting',
          reported === null
            ? `yt-dlp ${version} did not start`
            : `yt-dlp ${version} reports version ${reported}`
        )
      }
      await swapIn(staged, version, got.bytes)
      const stat = await fs.promises.stat(target())
      store({ installed: { version, size: stat.size, mtimeMs: stat.mtimeMs } })
      deps.log.info(
        current === null
          ? `Installed yt-dlp ${version}`
          : `Updated yt-dlp from ${current} to ${version}`
      )
      setState({ kind: 'updated', from: current, to: version })
    } finally {
      await fs.promises.rm(staged, { force: true }).catch(() => undefined)
    }
  }

  async function run(install: boolean): Promise<void> {
    const found = located()
    if (install && found?.source === 'system') {
      deps.log.info(
        `yt-dlp at ${found.path} is managed outside the app, so it is not updated`
      )
      return
    }
    if (asset === null) {
      fail(
        new YtdlpUpdateError(
          'no-build',
          `yt-dlp publishes no standalone build for ${deps.platform}-${deps.arch}`
        ),
        false
      )
      return
    }
    const before = state
    setState({ kind: 'checking' })
    try {
      latest = await queryLatest(deps.http, asset)
    } catch (err) {
      fail(err, false)
      return
    }
    const checkedAt = deps.timers.now()
    const file = await installed()
    const current = file === null ? null : await installedVersion(file)
    if (current !== null && compareVersions(current, latest.version) >= 0) {
      store({ lastCheckAt: checkedAt, lastFailure: null })
      deps.log.info(`yt-dlp ${current} is up to date`)
      setState({ kind: 'up-to-date' })
      return
    }
    if (!install) {
      state = before
      publish()
      return
    }
    try {
      await installRelease(latest, asset, current)
      store({ lastCheckAt: checkedAt, lastFailure: null })
    } catch (err) {
      fail(err, true)
    }
  }

  async function check(options: { install?: boolean } = {}): Promise<YtdlpStatus> {
    const install = options.install !== false
    while (job !== null) {
      const joined = jobInstalls
      await job
      if (joined || !install) {
        return status()
      }
    }
    jobInstalls = install
    job = run(install)
      .catch((err) => fail(err, false))
      .finally(() => {
        job = null
      })
    await job
    return status()
  }

  async function ensure(): Promise<string> {
    const found = located()
    if (found !== null) {
      return found.path
    }
    deps.log.info('yt-dlp is not installed; downloading the latest stable release')
    await check({ install: true })
    const after = located()
    if (after !== null) {
      return after.path
    }
    throw new Error(
      state?.kind === 'failed'
        ? `yt-dlp could not be installed. ${state.reason}`
        : 'yt-dlp could not be installed'
    )
  }

  /** Removes binaries an earlier run staged and never swapped in. */
  async function cleanupStaged(): Promise<void> {
    let names: string[]
    try {
      names = await fs.promises.readdir(deps.binDir())
    } catch {
      return
    }
    const mine = `${STAGE_PREFIX}${process.pid}-`
    for (const name of names) {
      if (name.startsWith(STAGE_PREFIX) && !name.startsWith(mine)) {
        await fs.promises
          .rm(path.join(deps.binDir(), name), { force: true })
          .catch(() => undefined)
      }
    }
  }

  async function autoCheck(): Promise<void> {
    try {
      const { autoUpdate, stored } = settings()
      if (!autoUpdate || job !== null || located()?.source !== 'app') {
        return
      }
      const now = deps.timers.now()
      const last = stored.lastCheckAt
      if (last !== null && now >= last && now - last < CHECK_INTERVAL_MS) {
        return
      }
      deps.log.info('Checking for a new yt-dlp')
      await check({ install: true })
    } catch (err) {
      deps.log.warn(`The automatic yt-dlp check stopped: ${messageOf(err)}`)
    }
  }

  function schedule(ms: number): void {
    timer = deps.timers.setTimeout(() => {
      timer = null
      void autoCheck().finally(() => {
        if (started) {
          schedule(POLL_MS)
        }
      })
    }, ms)
  }

  return {
    path: () => located()?.path ?? target(),
    located,
    status,
    check,
    ensure,
    track,
    start() {
      if (started) {
        return
      }
      started = true
      void cleanupStaged()
      schedule(FIRST_CHECK_DELAY_MS)
    },
    stop() {
      started = false
      if (timer !== null) {
        deps.timers.clearTimeout(timer)
        timer = null
      }
    },
    settingsChanged() {
      publish()
      if (started) {
        void autoCheck()
      }
    },
    onStatus(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}
