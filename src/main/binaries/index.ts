/**
 * The app's managed binaries: the yt-dlp updater and the FFmpeg installer over the real network, clock, config, and
 * file system; copies found on this computer; self-tests; and the status the setup screen and Settings show.
 */
import { app } from 'electron'
import { execFile } from 'child_process'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import type {
  BinariesScan,
  BinariesStatus,
  FfmpegStatus,
  SelfTestReport,
  YtdlpStatus
} from '@shared/types'
import { getConfig, setConfig } from '../config'
import { logger } from '../logger'
import { createHttp, isFfmpegSourceUrl, isGithubUrl } from './net'
import { realTimers } from './timers'
import { readSelfTest, readYtdlpState, writeSelfTest, writeYtdlpState } from './state'
import { adoptLegacyYtdlp } from './legacy'
import { findExecutable, findFfmpegDir, searchDirs } from './discovery'
import { runFfmpegSelfTest, runYtdlpSelfTest, spawnRunner } from './selftest'
import { ytdlpEnv, ytdlpRuntimeArgs } from './runtime'
import { createYtdlpUpdater, probeVersion, type YtdlpUpdater } from './ytdlp/updater'
import { executableName } from './ytdlp/release'
import { verifyDetachedSignature } from './ytdlp/signature'
import { createFfmpegInstaller, type FfmpegInstaller } from './ffmpeg/installer'
import { extractZip } from './ffmpeg/unzip'
import { executableName as ffmpegExecutable, parsePin } from './ffmpeg/pin'
import pinJson from './ffmpeg/pinned-builds.json'

type Which = 'ytdlp' | 'ffmpeg'

const userData = (): string => app.getPath('userData')
const legacyDir = (): string => path.join(userData(), 'bin')
const pathDirs = (): string[] => searchDirs(process.platform, process.env.PATH)

/** The yt-dlp on this computer's PATH, outside the app's own folders. */
function systemYtdlp(): string | null {
  return findExecutable(executableName(process.platform), pathDirs(), process.platform, [
    userData()
  ])
}

/** The folder on this computer's PATH holding ffmpeg and ffprobe, outside the app's own folders. */
function systemFfmpegDir(): string | null {
  return findFfmpegDir(pathDirs(), process.platform, [userData()])
}

function ffmpegPaths(dir: string): { ffmpeg: string; ffprobe: string } {
  return {
    ffmpeg: path.join(dir, ffmpegExecutable('ffmpeg', process.platform)),
    ffprobe: path.join(dir, ffmpegExecutable('ffprobe', process.platform))
  }
}

function run(file: string, args: readonly string[], timeout: number): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      file,
      [...args],
      { timeout, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err) => resolve(!err)
    )
  })
}

let ytdlp: YtdlpUpdater | null = null

export function ytdlpUpdater(): YtdlpUpdater {
  ytdlp ??= createYtdlpUpdater({
    http: createHttp(isGithubUrl),
    timers: realTimers,
    platform: process.platform,
    arch: process.arch,
    binDir: () => path.join(userData(), 'ytdlp-bin'),
    probe: (file) => probeVersion(file),
    verifySignature: (data, signature) => verifyDetachedSignature(data, signature),
    systemCopy: systemYtdlp,
    readSettings: () => {
      const config = getConfig()
      return {
        autoUpdate: config.autoUpdateYtdlp !== false,
        useSystem: config.ytdlpSource === 'system',
        stored: readYtdlpState()
      }
    },
    writeStored: (next) => writeYtdlpState(next),
    rename: (from, to) => fs.renameSync(from, to),
    log: logger
  })
  return ytdlp
}

let ffmpeg: FfmpegInstaller | null = null

export function ffmpegInstaller(): FfmpegInstaller {
  ffmpeg ??= createFfmpegInstaller({
    http: createHttp(isFfmpegSourceUrl),
    timers: realTimers,
    platform: process.platform,
    arch: process.arch,
    pin: parsePin(pinJson),
    root: () => path.join(userData(), 'ffmpeg'),
    legacyDir,
    useSystem: () => getConfig().ffmpegSource === 'system',
    systemDir: systemFfmpegDir,
    tmpDir: () => os.tmpdir(),
    runs: (file) => run(file, ['-version'], 30_000),
    extractZip,
    extractTarXz: async (file, dest) => {
      if (!(await run('tar', ['-xJf', file, '-C', dest], 300_000))) {
        throw new Error(
          'Could not extract the FFmpeg download; tar and xz must be installed'
        )
      }
    },
    log: logger
  })
  return ffmpeg
}

/** A file's identity for self-test caching: a replaced or updated binary is tested again. */
function identity(file: string | null): string | null {
  if (file === null) return null
  try {
    const stat = fs.statSync(file)
    return `${file}|${stat.size}|${stat.mtimeMs}`
  } catch {
    return null
  }
}

function storedReport(which: Which, file: string | null): SelfTestReport | null {
  const key = identity(file)
  const raw = readSelfTest(which) as { key?: unknown; report?: SelfTestReport } | null
  if (
    key === null ||
    raw === null ||
    raw.key !== key ||
    !Array.isArray(raw.report?.checks)
  ) {
    return null
  }
  return raw.report
}

function decorateYtdlp(status: YtdlpStatus): YtdlpStatus {
  return { ...status, selfTest: storedReport('ytdlp', status.path) }
}

function decorateFfmpeg(status: FfmpegStatus): FfmpegStatus {
  const selfTest = storedReport('ffmpeg', status.path)
  return { ...status, selfTest, version: status.version ?? selfTest?.version ?? null }
}

const listeners = new Set<(status: BinariesStatus) => void>()
let subscribed = false

function publishAll(status: BinariesStatus): void {
  for (const listener of listeners) listener(status)
  autoTest(status)
}

function subscribe(): void {
  if (subscribed) return
  subscribed = true
  ytdlpUpdater().onStatus((status) =>
    publishAll({
      ytdlp: decorateYtdlp(status),
      ffmpeg: decorateFfmpeg(ffmpegInstaller().status())
    })
  )
  ffmpegInstaller().onStatus((status) => {
    void ytdlpUpdater()
      .status()
      .then((current) =>
        publishAll({ ytdlp: decorateYtdlp(current), ffmpeg: decorateFfmpeg(status) })
      )
  })
}

export async function binariesStatus(): Promise<BinariesStatus> {
  return {
    ytdlp: decorateYtdlp(await ytdlpUpdater().status()),
    ffmpeg: decorateFfmpeg(ffmpegInstaller().status())
  }
}

const running = new Map<Which, Promise<SelfTestReport | null>>()

/** Self-tests the yt-dlp or FFmpeg in use and stores the report for it. Joins a test of the same binary in progress. */
export function runSelfTest(which: Which): Promise<SelfTestReport | null> {
  const existing = running.get(which)
  if (existing) return existing
  const job = (async (): Promise<SelfTestReport | null> => {
    const status = await binariesStatus()
    const target = status[which]
    if (!target.installed || target.path === null) return null
    const key = identity(target.path)
    const report =
      which === 'ytdlp'
        ? await ytdlpUpdater().track(
            runYtdlpSelfTest(spawnRunner, target.path, {
              runtimeArgs: ytdlpRuntimeArgs(),
              env: ytdlpEnv(),
              ffmpegDir: status.ffmpeg.installed ? ffmpegInstaller().dir() : null,
              now: Date.now()
            })
          )
        : await runFfmpegSelfTest(
            spawnRunner,
            ffmpegPaths(ffmpegInstaller().dir()),
            Date.now()
          )
    if (key !== null) writeSelfTest(which, { key, report })
    const failed = report.checks.filter((c) => !c.ok).map((c) => c.id)
    const line = `${which === 'ytdlp' ? 'yt-dlp' : 'FFmpeg'} self-test at ${target.path}: ${report.passed ? 'passed' : 'FAILED'}${failed.length ? ` (failed: ${failed.join(', ')})` : ''}`
    if (report.passed) logger.info(line)
    else logger.warn(line)
    if (listeners.size > 0) publishAll(await binariesStatus())
    return report
  })().finally(() => running.delete(which))
  running.set(which, job)
  return job
}

const autoTested = new Set<string>()

/** Tests a binary in use once per identity when it has no report, such as right after an install or update. */
function autoTest(status: BinariesStatus): void {
  const busy = {
    ytdlp:
      status.ytdlp.state.kind === 'checking' || status.ytdlp.state.kind === 'updating',
    ffmpeg: status.ffmpeg.state.kind === 'installing'
  }
  for (const which of ['ytdlp', 'ffmpeg'] as const) {
    const target = status[which]
    if (!target.installed || target.selfTest !== null || busy[which]) continue
    const key = identity(target.path)
    if (key === null || autoTested.has(key)) continue
    autoTested.add(key)
    void runSelfTest(which).catch((err) => logger.warn('Self-test failed to run:', err))
  }
}

/**
 * Looks for a yt-dlp and an FFmpeg on this computer and self-tests each, for setup to offer, and looks up the yt-dlp
 * release the app would download. Nothing is installed or chosen.
 */
export async function scanBinaries(): Promise<BinariesScan> {
  const ffDir = systemFfmpegDir()
  const ytFile = systemYtdlp()
  const ffmpegReport = ffDir
    ? await runFfmpegSelfTest(spawnRunner, ffmpegPaths(ffDir), Date.now())
    : null
  const appFfmpeg = ffmpegInstaller().status()
  const ffmpegForYtdlp =
    ffDir ??
    (appFfmpeg.installed && appFfmpeg.source === 'app' ? ffmpegInstaller().dir() : null)
  const ytdlpReport = ytFile
    ? await runYtdlpSelfTest(spawnRunner, ytFile, {
        runtimeArgs: ytdlpRuntimeArgs(),
        env: ytdlpEnv(),
        ffmpegDir: ffmpegForYtdlp,
        now: Date.now()
      })
    : null
  const release = await ytdlpUpdater()
    .check({ install: false })
    .then((status) => status.latest)
    .catch(() => null)
  return {
    ytdlp:
      ytFile && ytdlpReport
        ? { path: ytFile, version: ytdlpReport.version, report: ytdlpReport }
        : null,
    ffmpeg:
      ffDir && ffmpegReport
        ? {
            path: ffmpegPaths(ffDir).ffmpeg,
            version: ffmpegReport.version,
            report: ffmpegReport
          }
        : null,
    ytdlpRelease: release
  }
}

/**
 * Installs what is missing: the app's verified yt-dlp unless a chosen copy on this computer is present, and the pinned
 * FFmpeg when no build is in use (an older build is upgraded in the background instead). Never throws; the status
 * carries each failure.
 */
export async function bootstrapBinaries(): Promise<BinariesStatus> {
  const installer = ffmpegInstaller()
  await Promise.allSettled([
    ytdlpUpdater().ensure(),
    installer.status().installed ? Promise.resolve() : installer.ensure()
  ])
  return binariesStatus()
}

/** Calls `listener` with the whole status whenever either binary's status or self-test changes. */
export function onBinariesStatus(listener: (status: BinariesStatus) => void): () => void {
  subscribe()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Applies changed source settings to both binaries. */
export function binarySourcesChanged(): void {
  ytdlpUpdater().settingsChanged()
  ffmpegInstaller().settingsChanged()
}

/**
 * Takes over the yt-dlp an earlier release downloaded, marks setup done for installs that already have both binaries,
 * then starts the automatic yt-dlp checks and the background FFmpeg work. Runs before anything spawns either binary.
 */
export function startBinaries(): void {
  adoptLegacyYtdlp(
    legacyDir(),
    path.join(userData(), 'ytdlp-bin', executableName(process.platform)),
    process.platform,
    logger
  )
  if (
    !getConfig().setupComplete &&
    ytdlpUpdater().located() !== null &&
    ffmpegInstaller().status().installed
  ) {
    setConfig({ setupComplete: true })
  }
  ytdlpUpdater().start()
  ffmpegInstaller().start()
}

export function stopBinaries(): void {
  ytdlp?.stop()
  ffmpeg?.stop()
}
