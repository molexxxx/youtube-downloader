import { execFile } from 'child_process'
import { chmod, readdir, rename, rm, stat } from 'fs/promises'
import { createReadStream } from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import { pipeline } from 'stream/promises'
import { createGunzip } from 'zlib'
import extractZip from 'extract-zip'
import * as tar from 'tar'
import type { BinaryStatus, BootstrapProgress } from '@shared/types'
import { logger } from '../logger'
import { binDir, currentPlatform, downloadFile, ensureBinDir } from './net'

const execFileAsync = promisify(execFile)

const SOURCES = {
  win32: {
    url: 'https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip',
    archive: 'zip' as const
  },
  linux: {
    url: 'https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linux64-gpl.tar.xz',
    archive: 'tar' as const
  },
  darwin: {
    url: 'https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip',
    archive: 'zip' as const
  }
}

function exe(name: string): string {
  return currentPlatform() === 'win32' ? `${name}.exe` : name
}

export function ffmpegPath(): string {
  return join(binDir(), exe('ffmpeg'))
}

export function ffmpegDir(): string {
  return binDir()
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export async function ffmpegVersion(path: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(path, ['-version'], { timeout: 15_000 })
    const match = stdout.match(/ffmpeg version (\S+)/)
    return match ? match[1] : stdout.split('\n')[0]?.trim() || null
  } catch (err) {
    logger.warn('Failed to read ffmpeg version:', err)
    return null
  }
}

export async function ffmpegStatus(): Promise<BinaryStatus> {
  const path = ffmpegPath()
  const installed = await fileExists(path)
  return {
    name: 'ffmpeg',
    installed,
    path: installed ? path : null,
    version: installed ? await ffmpegVersion(path) : null
  }
}

/** Recursively find the ffmpeg/ffprobe executables inside an extracted tree. */
async function findBinary(root: string, name: string): Promise<string | null> {
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      const found = await findBinary(full, name)
      if (found) return found
    } else if (entry.name === name) {
      return full
    }
  }
  return null
}

async function extractArchive(
  archivePath: string,
  kind: 'zip' | 'tar',
  dest: string
): Promise<void> {
  if (kind === 'zip') {
    await extractZip(archivePath, { dir: dest })
    return
  }
  // tar.xz - decompress xz is not built-in; BtbN linux uses .tar.xz which `tar`
  // handles when the xz binary is present. Fall back to gzip-safe handling.
  if (archivePath.endsWith('.xz')) {
    await tar.x({ file: archivePath, cwd: dest })
    return
  }
  await pipeline(createReadStream(archivePath), createGunzip(), tar.x({ cwd: dest }))
}

export async function ensureFfmpeg(
  onProgress?: (p: BootstrapProgress) => void
): Promise<BinaryStatus> {
  const target = ffmpegPath()

  onProgress?.({ binary: 'ffmpeg', stage: 'checking', percent: null })
  if (await fileExists(target)) {
    const version = await ffmpegVersion(target)
    onProgress?.({ binary: 'ffmpeg', stage: 'complete', percent: 100 })
    return { name: 'ffmpeg', installed: true, path: target, version }
  }

  const dir = await ensureBinDir()
  const source = SOURCES[currentPlatform()]
  const ext = source.archive === 'zip' ? 'zip' : archiveExt(source.url)
  const archivePath = join(dir, `ffmpeg-download.${ext}`)
  const extractDir = join(dir, 'ffmpeg-extract')

  logger.info('Downloading ffmpeg from', source.url)
  await downloadFile(source.url, archivePath, (downloaded, total) => {
    const percent = total ? Math.round((downloaded / total) * 100) : null
    onProgress?.({ binary: 'ffmpeg', stage: 'downloading', percent })
  })

  onProgress?.({ binary: 'ffmpeg', stage: 'extracting', percent: null })
  await rm(extractDir, { recursive: true, force: true })
  await extractArchive(archivePath, source.archive, extractDir)

  for (const name of [exe('ffmpeg'), exe('ffprobe')]) {
    const found = await findBinary(extractDir, name)
    if (found) {
      const out = join(dir, name)
      await rm(out, { force: true })
      await rename(found, out)
      if (currentPlatform() !== 'win32') await chmod(out, 0o755)
    }
  }

  await rm(archivePath, { force: true })
  await rm(extractDir, { recursive: true, force: true })

  onProgress?.({ binary: 'ffmpeg', stage: 'verifying', percent: null })
  const version = await ffmpegVersion(target)
  if (!version) {
    onProgress?.({
      binary: 'ffmpeg',
      stage: 'error',
      percent: null,
      message: 'ffmpeg failed verification'
    })
    throw new Error('ffmpeg downloaded but failed to report a version')
  }

  onProgress?.({ binary: 'ffmpeg', stage: 'complete', percent: 100 })
  logger.info('ffmpeg ready, version', version)
  return { name: 'ffmpeg', installed: true, path: target, version }
}

function archiveExt(url: string): string {
  if (url.endsWith('.tar.xz')) return 'tar.xz'
  if (url.endsWith('.tar.gz')) return 'tar.gz'
  return 'zip'
}

export async function updateFfmpeg(
  onProgress?: (p: BootstrapProgress) => void
): Promise<BinaryStatus> {
  await rm(ffmpegPath(), { force: true })
  return ensureFfmpeg(onProgress)
}
