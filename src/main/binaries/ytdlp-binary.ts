import { execFile } from 'child_process'
import { chmod, stat } from 'fs/promises'
import { join } from 'path'
import { promisify } from 'util'
import type { BinaryStatus, BootstrapProgress } from '@shared/types'
import { logger } from '../logger'
import { binDir, currentPlatform, downloadFile, ensureBinDir } from './net'

const execFileAsync = promisify(execFile)

const RELEASE_BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download'

function assetName(): string {
  switch (currentPlatform()) {
    case 'win32':
      return 'yt-dlp.exe'
    case 'darwin':
      return 'yt-dlp_macos'
    default:
      return 'yt-dlp'
  }
}

export function ytdlpPath(): string {
  return join(binDir(), assetName())
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export async function ytdlpVersion(path: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(path, ['--version'], { timeout: 15_000 })
    return stdout.trim() || null
  } catch (err) {
    logger.warn('Failed to read yt-dlp version:', err)
    return null
  }
}

export async function ytdlpStatus(): Promise<BinaryStatus> {
  const path = ytdlpPath()
  const installed = await fileExists(path)
  return {
    name: 'yt-dlp',
    installed,
    path: installed ? path : null,
    version: installed ? await ytdlpVersion(path) : null
  }
}

export async function ensureYtdlp(
  onProgress?: (p: BootstrapProgress) => void
): Promise<BinaryStatus> {
  const path = ytdlpPath()

  onProgress?.({ binary: 'yt-dlp', stage: 'checking', percent: null })
  if (await fileExists(path)) {
    const version = await ytdlpVersion(path)
    onProgress?.({ binary: 'yt-dlp', stage: 'complete', percent: 100 })
    return { name: 'yt-dlp', installed: true, path, version }
  }

  await ensureBinDir()
  const url = `${RELEASE_BASE}/${assetName()}`
  logger.info('Downloading yt-dlp from', url)

  await downloadFile(url, path, (downloaded, total) => {
    const percent = total ? Math.round((downloaded / total) * 100) : null
    onProgress?.({ binary: 'yt-dlp', stage: 'downloading', percent })
  })

  if (currentPlatform() !== 'win32') {
    await chmod(path, 0o755)
  }

  onProgress?.({ binary: 'yt-dlp', stage: 'verifying', percent: null })
  const version = await ytdlpVersion(path)
  if (!version) {
    onProgress?.({
      binary: 'yt-dlp',
      stage: 'error',
      percent: null,
      message: 'yt-dlp failed verification'
    })
    throw new Error('yt-dlp downloaded but failed to report a version')
  }

  onProgress?.({ binary: 'yt-dlp', stage: 'complete', percent: 100 })
  logger.info('yt-dlp ready, version', version)
  return { name: 'yt-dlp', installed: true, path, version }
}

/** Update yt-dlp via its built-in self-updater. */
export async function updateYtdlp(
  onProgress?: (p: BootstrapProgress) => void
): Promise<BinaryStatus> {
  const path = ytdlpPath()
  if (!(await fileExists(path))) {
    return ensureYtdlp(onProgress)
  }

  onProgress?.({
    binary: 'yt-dlp',
    stage: 'downloading',
    percent: null,
    message: 'Updating'
  })
  try {
    await execFileAsync(path, ['-U'], { timeout: 120_000 })
  } catch (err) {
    logger.warn('yt-dlp self-update failed, re-downloading:', err)
    await downloadFile(`${RELEASE_BASE}/${assetName()}`, path)
    if (currentPlatform() !== 'win32') await chmod(path, 0o755)
  }

  onProgress?.({ binary: 'yt-dlp', stage: 'complete', percent: 100 })
  return ytdlpStatus()
}
