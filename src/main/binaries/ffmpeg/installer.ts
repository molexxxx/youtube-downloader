/**
 * The FFmpeg the app runs: the build this app version pins, installed into `<userData>/ffmpeg/<build id>/`.
 *
 * Every archive streams through SHA-256 and must match the pin's size and digest before anything is extracted, and
 * the extracted ffmpeg and ffprobe must start before their staging folder is renamed into place. A build is never
 * changed after it is installed, so a newer pin installs beside the build in use: the app keeps running the older
 * build (or the one an earlier release left in `<userData>/bin`) until the pinned one is ready, then switches and
 * removes the older folders. FFmpeg only changes with an app release, through scripts/update-ffmpeg-pin.mjs.
 */
import * as fs from 'fs'
import * as path from 'path'
import { randomBytes } from 'crypto'
import type {
  BinarySource,
  FfmpegInstallState,
  FfmpegPinnedBuild,
  FfmpegStatus
} from '@shared/types'
import { HttpStatusError, type Http } from '../net'
import type { TimerHandle, Timers } from '../timers'
import {
  buildVersion,
  executableName,
  foldersToDelete,
  isPinId,
  pinKey,
  pinnedFolders,
  planInstall,
  publisherOf,
  type Asset,
  type PinnedBuilds
} from './pin'

/** How long after startup the background work waits, so it never competes with startup. */
export const FIRST_RUN_DELAY_MS = 20_000

/** How long a failed background install waits before it tries again. */
export const RETRY_MS = 60 * 60 * 1000

const PROGRESS_INTERVAL_MS = 200

/** The message shown when a download does not match its pin. */
export const CHECKSUM_MESSAGE =
  'The FFmpeg download did not match the expected checksum, so it was discarded. Try again later.'

/** What the installer reads and runs; tests pass temp folders, a stubbed network, and a manual clock. */
export interface InstallerDeps {
  http: Http
  timers: Timers
  platform: NodeJS.Platform
  arch: string
  pin: PinnedBuilds
  /** The folder every pinned build is installed under. */
  root(): string
  /** The folder releases before the pinned builds downloaded ffmpeg and ffprobe into. */
  legacyDir(): string
  /** Whether the owner chose the FFmpeg on this computer over the app's builds. */
  useSystem(): boolean
  /** The folder on this computer holding ffmpeg and ffprobe, outside the app's folders, or null. */
  systemDir(): string | null
  tmpDir(): string
  /** Runs `<tool> -version` and answers whether it started and exited cleanly. */
  runs(file: string): Promise<boolean>
  extractZip(
    file: string,
    dest: string,
    wanted: (baseName: string) => boolean
  ): Promise<void>
  extractTarXz(file: string, dest: string): Promise<void>
  log: {
    info(...parts: unknown[]): void
    warn(...parts: unknown[]): void
    error(...parts: unknown[]): void
  }
}

/** The FFmpeg installer's surface for the binary paths, the IPC handlers, and the app lifecycle. */
export interface FfmpegInstaller {
  /** The folder holding the ffmpeg and ffprobe the app runs; the pinned build's folder while none is installed. */
  dir(): string
  status(): FfmpegStatus
  /** Installs the pinned build unless it is installed; joins an install in progress and throws when it fails. */
  ensure(): Promise<void>
  /** Starts the background work: removing leftovers, and installing the pinned build while an older one is in use. */
  start(): void
  stop(): void
  /** Applies a changed source setting: announces the build now in use, and installs the pinned one when needed. */
  settingsChanged(): void
  onStatus(listener: (status: FfmpegStatus) => void): () => void
}

/** The build in use: a pinned build folder, the legacy folder (`id` null), or one on this computer. */
interface Build {
  id: string | null
  dir: string
  current: boolean
  source: BinarySource
}

class AssetStatusError extends Error {
  constructor(
    readonly url: string,
    readonly status: number
  ) {
    super(`The FFmpeg download answered with status ${status}: ${url}`)
    this.name = 'AssetStatusError'
  }
}

function compareDotted(a: string, b: string): number {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return Math.sign(diff)
  }
  return 0
}

function isFile(file: string): boolean {
  try {
    return fs.statSync(file).isFile()
  } catch {
    return false
  }
}

function listFolders(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  } catch {
    return []
  }
}

function findFile(dir: string, name: string): string | null {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isFile() && entry.name === name) return full
    if (entry.isDirectory()) {
      const found = findFile(full, name)
      if (found) return found
    }
  }
  return null
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** The installer over `deps`. */
export function createFfmpegInstaller(deps: InstallerDeps): FfmpegInstaller {
  const key = pinKey(deps.platform, deps.arch)
  const entry = deps.pin.platforms[key] ?? null
  const ffmpegName = executableName('ffmpeg', deps.platform)
  const ffprobeName = executableName('ffprobe', deps.platform)
  const listeners = new Set<(status: FfmpegStatus) => void>()
  let state: FfmpegInstallState = { kind: 'idle' }
  let build: Build | null = null
  let job: Promise<void> | null = null
  let timer: TimerHandle | null = null
  let started = false
  let lastProgressAt = Number.NEGATIVE_INFINITY

  const hasBoth = (dir: string): boolean =>
    isFile(path.join(dir, ffmpegName)) && isFile(path.join(dir, ffprobeName))

  /** The installed folder of this pin's build, primary first, or null. */
  function pinnedInstalled(): string | null {
    const root = deps.root()
    return pinnedFolders(deps.pin, key).find((id) => hasBoth(path.join(root, id))) ?? null
  }

  /**
   * The build to run: the one on this computer while chosen and present, else this pin's, else the newest older
   * pinned build, else the legacy folder.
   */
  function resolve(): Build | null {
    if (deps.useSystem()) {
      const dir = deps.systemDir()
      if (dir !== null) return { id: null, dir, current: true, source: 'system' }
    }
    const root = deps.root()
    const pinned = pinnedFolders(deps.pin, key)
    const current = pinnedInstalled()
    if (current !== null) {
      return { id: current, dir: path.join(root, current), current: true, source: 'app' }
    }
    const older = listFolders(root)
      .filter(
        (name) =>
          isPinId(name) && !pinned.includes(name) && hasBoth(path.join(root, name))
      )
      .sort((a, b) => compareDotted(buildVersion(b) ?? '0', buildVersion(a) ?? '0'))
    if (older.length > 0) {
      return {
        id: older[0],
        dir: path.join(root, older[0]),
        current: false,
        source: 'app'
      }
    }
    if (hasBoth(deps.legacyDir())) {
      return { id: null, dir: deps.legacyDir(), current: false, source: 'app' }
    }
    return null
  }

  function refresh(): Build | null {
    build = resolve()
    return build
  }

  function pinnedBuild(): FfmpegPinnedBuild | null {
    if (!entry || entry.primary.length === 0) return null
    const id = entry.primary[0].build
    return {
      version: entry.version,
      build: id,
      bytes: entry.primary.reduce((sum, a) => sum + a.bytes, 0),
      publisher: publisherOf(id) ?? new URL(entry.primary[0].url).hostname
    }
  }

  function status(): FfmpegStatus {
    const found = refresh()
    return {
      installed: found !== null,
      version: found?.id ? buildVersion(found.id) : null,
      build: found?.id ?? null,
      path: found ? path.join(found.dir, ffmpegName) : null,
      source: found?.source ?? null,
      selfTest: null,
      pinned: pinnedBuild(),
      state
    }
  }

  function publish(): void {
    if (listeners.size === 0) return
    const next = status()
    for (const listener of listeners) listener(next)
  }

  function setState(next: FfmpegInstallState): void {
    state = next
    publish()
  }

  function progress(
    phase: 'downloading' | 'extracting' | 'verifying',
    receivedBytes: number,
    totalBytes: number,
    force: boolean
  ): void {
    state = {
      kind: 'installing',
      phase,
      version: entry?.version ?? deps.pin.version,
      receivedBytes,
      totalBytes
    }
    const now = deps.timers.now()
    if (force || now - lastProgressAt >= PROGRESS_INTERVAL_MS) {
      lastProgressAt = now
      publish()
    }
  }

  async function download(
    asset: Asset,
    file: string,
    onBytes: (received: number) => void
  ): Promise<{ bytes: number; sha256: string }> {
    try {
      return await deps.http.download(asset.url, file, {
        maxBytes: asset.bytes,
        onProgress: (received) => onBytes(received)
      })
    } catch (err) {
      if (err instanceof HttpStatusError)
        throw new AssetStatusError(asset.url, err.status)
      throw err
    }
  }

  async function installAssets(assets: readonly Asset[]): Promise<void> {
    const version = entry?.version ?? deps.pin.version
    const buildId = assets[0].build
    const root = deps.root()
    const total = assets.reduce((sum, a) => sum + a.bytes, 0)
    await fs.promises.mkdir(root, { recursive: true })
    const tmp = await fs.promises.mkdtemp(path.join(deps.tmpDir(), 'ytd-ffmpeg-'))
    let staging: string | null = null
    try {
      const extracted = path.join(tmp, 'x')
      await fs.promises.mkdir(extracted)
      let done = 0
      progress('downloading', 0, total, true)
      for (const [i, asset] of assets.entries()) {
        const file = path.join(tmp, `asset-${i}`)
        deps.log.info(`Downloading FFmpeg ${version} from ${asset.url}`)
        const got = await download(asset, file, (received) =>
          progress('downloading', done + Math.min(received, asset.bytes), total, false)
        )
        if (got.bytes !== asset.bytes || got.sha256 !== asset.sha256) {
          deps.log.error(
            `${asset.url}: expected ${asset.bytes} bytes with SHA-256 ${asset.sha256}, received ${got.bytes} bytes with SHA-256 ${got.sha256}`
          )
          throw new Error(CHECKSUM_MESSAGE)
        }
        deps.log.info(
          `Verified ${path.posix.basename(new URL(asset.url).pathname)}: ${got.bytes} bytes, SHA-256 ${got.sha256}`
        )
        done += asset.bytes
        progress('extracting', done, total, true)
        if (asset.kind === 'zip') {
          await deps.extractZip(
            file,
            extracted,
            (name) => name === ffmpegName || name === ffprobeName
          )
        } else {
          await deps.extractTarXz(file, extracted)
        }
        await fs.promises.rm(file, { force: true })
      }

      const ffmpegSrc = findFile(extracted, ffmpegName)
      const ffprobeSrc = findFile(extracted, ffprobeName)
      if (!ffmpegSrc || !ffprobeSrc) {
        throw new Error(
          `The FFmpeg ${version} download holds no ${!ffmpegSrc ? ffmpegName : ffprobeName}`
        )
      }

      staging = path.join(root, `${buildId}.part-${randomBytes(6).toString('hex')}`)
      await fs.promises.mkdir(staging)
      for (const [src, name] of [
        [ffmpegSrc, ffmpegName],
        [ffprobeSrc, ffprobeName]
      ] as const) {
        const dest = path.join(staging, name)
        await fs.promises.copyFile(src, dest)
        if (deps.platform !== 'win32') await fs.promises.chmod(dest, 0o755)
      }

      progress('verifying', total, total, true)
      for (const name of [ffmpegName, ffprobeName]) {
        if (!(await deps.runs(path.join(staging, name)))) {
          throw new Error(`The FFmpeg ${version} ${name} did not start on this computer`)
        }
      }

      const folder = path.join(root, buildId)
      await fs.promises.rm(folder, { recursive: true, force: true })
      await fs.promises.rename(staging, folder)
      staging = null
      deps.log.info(
        `FFmpeg ${version} (${buildId}) installed into ${folder} and verified`
      )
    } finally {
      if (staging) {
        await fs.promises
          .rm(staging, { recursive: true, force: true })
          .catch(() => undefined)
      }
      await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  async function install(): Promise<void> {
    const failures: Array<{ url: string; status: number }> = []
    let last: { source: 'primary' | 'fallback'; error: AssetStatusError } | null = null
    for (;;) {
      const installed = listFolders(deps.root()).filter((name) =>
        hasBoth(path.join(deps.root(), name))
      )
      const plan = planInstall(deps.pin, key, installed, failures)
      if (plan.kind === 'unavailable') {
        throw new Error(
          entry
            ? `No pinned FFmpeg ${entry.version} build can be downloaded right now. Try again later, or update the app.`
            : `This app version pins no FFmpeg build for ${key}.`
        )
      }
      if (plan.kind === 'reuse') return
      if (last && last.source === plan.source) throw last.error
      try {
        await installAssets(plan.assets)
        return
      } catch (err) {
        if (!(err instanceof AssetStatusError)) throw err
        deps.log.warn(`FFmpeg ${plan.source} download answered ${err.status}: ${err.url}`)
        failures.push({ url: err.url, status: err.status })
        last = { source: plan.source, error: err }
      }
    }
  }

  /**
   * Deletes interrupted installs, and once this pin is installed, every older build. A build on this computer being
   * in use deletes nothing more, so switching back to the app's builds needs no download. Never throws.
   */
  async function removeLeftovers(): Promise<void> {
    const root = deps.root()
    const current = pinnedInstalled() !== null
    const keep = current
      ? pinnedFolders(deps.pin, key)
      : listFolders(root).filter(isPinId)
    let entries: string[]
    try {
      entries = await fs.promises.readdir(root)
    } catch {
      return
    }
    for (const name of foldersToDelete(keep, entries)) {
      try {
        await fs.promises.rm(path.join(root, name), { recursive: true, force: true })
        deps.log.info(`Removed the older FFmpeg build ${name}`)
      } catch (err) {
        deps.log.warn(
          `Could not remove the older FFmpeg build ${name}: ${messageOf(err)}`
        )
      }
    }
    if (current) {
      for (const name of [ffmpegName, ffprobeName]) {
        await fs.promises
          .rm(path.join(deps.legacyDir(), name), { force: true })
          .catch(() => undefined)
      }
      await fs.promises.rmdir(deps.legacyDir()).catch(() => undefined)
    }
  }

  function ensure(): Promise<void> {
    if (job) return job
    if (refresh()?.current) return Promise.resolve()
    job = install()
      .then(
        () => {
          refresh()
          setState({ kind: 'idle' })
          void removeLeftovers()
        },
        (err: unknown) => {
          deps.log.error(`FFmpeg install failed: ${messageOf(err)}`)
          setState({ kind: 'failed', reason: messageOf(err), at: deps.timers.now() })
          throw err
        }
      )
      .finally(() => {
        job = null
      })
    return job
  }

  async function background(): Promise<void> {
    await removeLeftovers()
    const found = refresh()
    if (found === null || found.current) return
    deps.log.info(
      `Installing the pinned FFmpeg ${entry?.version ?? deps.pin.version}; the app keeps using ${found.id ?? 'the earlier download'} until it is ready`
    )
    try {
      await ensure()
    } catch {
      if (started) {
        timer = deps.timers.setTimeout(() => {
          timer = null
          void background()
        }, RETRY_MS)
      }
    }
  }

  return {
    dir() {
      const found = build ?? refresh()
      return (
        found?.dir ?? path.join(deps.root(), pinnedFolders(deps.pin, key)[0] ?? 'ffmpeg')
      )
    },
    status,
    ensure,
    start() {
      if (started) return
      started = true
      timer = deps.timers.setTimeout(() => {
        timer = null
        void background()
      }, FIRST_RUN_DELAY_MS)
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
      if (started && job === null) void background()
    },
    onStatus(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}
