import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { EventEmitter } from 'events'
import type { DownloadJob, DownloadRequest } from '@shared/types'
import { getConfig } from '../config'
import { logger } from '../logger'
import { ffmpegDir } from '../binaries/ffmpeg-binary'
import { ytdlpPath } from '../binaries/ytdlp-binary'
import { cookieArgs, cookiesEnabled, isAuthRequiredError } from './cookies'

const PROGRESS_TEMPLATE =
  'download:progress:{"percent":"%(progress._percent_str)s","speed":"%(progress._speed_str)s","eta":"%(progress._eta_str)s"}'

interface RunningJob {
  job: DownloadJob
  kill: () => void
}

interface QueuedItem {
  id: string
  req: DownloadRequest
}

/** States in which a job is still active (not finished or cancelled). */
function isActiveState(state: DownloadJob['state']): boolean {
  return (
    state === 'queued' ||
    state === 'downloading' ||
    state === 'processing' ||
    state === 'extracting'
  )
}

/** Whether two requests target the exact same download (used for de-duplication). */
function sameRequest(a: DownloadRequest, b: DownloadRequest): boolean {
  return (
    a.url === b.url &&
    a.kind === b.kind &&
    a.formatId === b.formatId &&
    a.container === b.container &&
    a.audioFormat === b.audioFormat &&
    a.audioBitrate === b.audioBitrate &&
    a.playlistItems === b.playlistItems &&
    Boolean(a.noPlaylist) === Boolean(b.noPlaylist)
  )
}

/**
 * Builds the yt-dlp argument list for a download request. Pure function - unit tested.
 */
export function buildArgs(req: DownloadRequest, cfg = getConfig(), includeCookies = true): string[] {
  const args: string[] = [
    req.url,
    '--ignore-config',
    '--no-warnings',
    '--no-check-certificates',
    '--ffmpeg-location',
    ffmpegDir(),
    '--newline',
    '--progress-template',
    PROGRESS_TEMPLATE,
    '--paths',
    cfg.downloadDir,
    '--output',
    cfg.outputTemplate
  ]

  if (req.kind === 'audio') {
    args.push('--extract-audio', '--audio-format', req.audioFormat ?? 'mp3')
    if (req.audioBitrate) args.push('--audio-quality', `${req.audioBitrate}K`)
  } else {
    // Pick the output container (mp4 by default, mkv if requested). Both support
    // metadata/thumbnail embedding, unlike webm. A chosen video-only format is
    // paired with the best audio so the result always has sound.
    const container = req.container ?? cfg.videoContainer
    const format = req.formatId
      ? `${req.formatId}+bestaudio/${req.formatId}/best`
      : 'bestvideo+bestaudio/best'
    args.push(
      '--format',
      format,
      '--merge-output-format',
      container,
      '--remux-video',
      container
    )
  }

  if (req.noPlaylist) args.push('--no-playlist')
  if (req.playlistItems) args.push('--playlist-items', req.playlistItems)

  // Per-download overrides take precedence over the saved config when provided.
  const embedThumbnail = req.embedThumbnail ?? cfg.embedThumbnail
  const embedMetadata = req.embedMetadata ?? cfg.embedMetadata
  const embedChapters = req.embedChapters ?? cfg.embedChapters
  const writeSubtitles = req.writeSubtitles ?? cfg.writeSubtitles
  const sponsorBlock = req.sponsorBlock ?? cfg.sponsorBlock

  // Thumbnail embedding only works on yt-dlp's supported containers. For audio
  // that means mp3/m4a/opus/flac - WAV has no tag container, so embedding into
  // it fails postprocessing. Skip it there instead of erroring the download.
  const audioSupportsThumbnail = req.audioFormat !== 'wav'
  const canEmbedThumbnail =
    req.kind === 'video' || (req.kind === 'audio' && audioSupportsThumbnail)
  const canEmbedMetadata = req.kind === 'audio' || req.kind === 'video'
  if (canEmbedThumbnail && embedThumbnail) args.push('--embed-thumbnail')
  if (canEmbedMetadata && embedMetadata) args.push('--embed-metadata')
  if (req.kind === 'video' && embedChapters) args.push('--embed-chapters')
  if (writeSubtitles && cfg.subtitleLangs.length) {
    args.push('--write-subs', '--sub-langs', cfg.subtitleLangs.join(','))
  }
  if (sponsorBlock) args.push('--sponsorblock-remove', 'default')
  if (cfg.useDownloadArchive) {
    args.push('--download-archive', 'archive.txt')
  }
  if (includeCookies) args.push(...cookieArgs(cfg))

  return args
}

function parsePercent(value: string): number {
  const n = parseFloat(value.replace('%', '').trim())
  return Number.isFinite(n) ? n : 0
}

/**
 * Concurrency-limited download manager. Emits `update` events with the changed job.
 */
export class DownloadManager extends EventEmitter {
  private queue: QueuedItem[] = []
  private running = new Map<string, RunningJob>()
  private jobs = new Map<string, DownloadJob>()
  private lastError = new Map<string, string>()
  // The request backing each job, kept so retries (e.g. cookie fallback) and
  // dedupe can reason about the exact parameters that started it.
  private requests = new Map<string, DownloadRequest>()

  enqueue(req: DownloadRequest): DownloadJob {
    // Dedupe: if an identical request is already active (queued or in progress),
    // return that job instead of starting a duplicate download.
    const existing = this.findActive(req)
    if (existing) {
      logger.info('Reusing active download for', req.url, `(${req.kind})`)
      return existing
    }

    const job: DownloadJob = {
      id: randomUUID(),
      url: req.url,
      title: req.title?.trim() || req.url,
      kind: req.kind,
      state: 'queued',
      percent: 0,
      speed: null,
      eta: null,
      outputPath: null,
      error: null,
      createdAt: Date.now()
    }
    this.jobs.set(job.id, job)
    this.requests.set(job.id, req)
    this.queue.push({ id: job.id, req })
    logger.info(`Queued ${req.kind} download`, job.id, req.url)
    this.emitUpdate(job)
    this.pump()
    return job
  }

  /** Find an active job started by an identical request. */
  private findActive(req: DownloadRequest): DownloadJob | null {
    for (const job of this.jobs.values()) {
      if (!isActiveState(job.state)) continue
      const original = this.requests.get(job.id)
      if (original && sameRequest(original, req)) return job
    }
    return null
  }

  list(): DownloadJob[] {
    return [...this.jobs.values()].sort((a, b) => a.createdAt - b.createdAt)
  }

  cancel(id: string): void {
    const running = this.running.get(id)
    if (running) {
      logger.info('Cancelling running download', id)
      running.kill()
      return
    }
    const idx = this.queue.findIndex((item) => item.id === id)
    if (idx >= 0) {
      this.queue.splice(idx, 1)
      logger.info('Cancelled queued download', id)
      this.patch(id, { state: 'cancelled' })
    }
  }

  private pump(): void {
    const max = getConfig().maxConcurrentDownloads
    while (this.running.size < max && this.queue.length > 0) {
      const { id, req } = this.queue.shift()!
      this.start(id, req)
    }
  }

  private start(id: string, req: DownloadRequest): void {
    logger.info('Starting download', id, req.url)
    // Cookie-free first: authenticated YouTube sessions often advertise only
    // SABR/storyboard formats that break public downloads. Cookies are used only
    // as a fallback when the content actually needs auth (see the close handler).
    this.spawnJob(id, req, false)
  }

  private retried = new Set<string>()
  private stdoutBuffers = new Map<string, string>()

  private spawnJob(id: string, req: DownloadRequest, includeCookies: boolean): void {
    const args = buildArgs(req, getConfig(), includeCookies)
    logger.info(
      `Spawning yt-dlp for ${id}`,
      includeCookies ? '(with cookies)' : '(cookie-free)'
    )
    this.patch(id, { state: 'downloading' })

    const child = spawn(ytdlpPath(), args, {
      env: { ...process.env, FFMPEG_LOCATION: ffmpegDir() }
    })

    this.running.set(id, { job: this.jobs.get(id)!, kill: () => child.kill() })
    this.stdoutBuffers.set(id, '')

    child.stdout.on('data', (buf: Buffer) => this.handleChunk(id, buf.toString()))
    child.stderr.on('data', (buf: Buffer) => {
      const text = buf.toString().trim()
      logger.debug('yt-dlp', text)
      // Capture the most recent ERROR line so the UI can show a real reason
      // instead of a bare exit code.
      for (const line of text.split('\n')) {
        const match = line.match(/ERROR:\s*(.+)/i)
        if (match) this.lastError.set(id, match[1].trim())
      }
    })

    child.on('error', (err) => {
      logger.error('Download process failed to start', id, err.message)
      this.patch(id, { state: 'error', error: err.message })
      this.finish(id)
    })
    child.on('close', (code) => {
      const job = this.jobs.get(id)
      if (job && job.state !== 'cancelled') {
        if (code === 0) {
          logger.info('Download complete', id, job.outputPath ?? job.url)
          this.patch(id, { state: 'completed', percent: 100 })
        } else {
          const reason = this.lastError.get(id)
          // Only private / age-restricted / members-only content (or a bot-flag)
          // benefits from cookies, so retry with them just for those errors.
          if (
            !includeCookies &&
            reason &&
            cookiesEnabled() &&
            isAuthRequiredError(reason) &&
            !this.retried.has(id)
          ) {
            logger.warn('Download needs authentication, retrying with cookies', id)
            this.retried.add(id)
            this.lastError.delete(id)
            this.running.delete(id)
            // Reset visible progress so the retry doesn't appear to resume from
            // wherever the failed attempt happened to stop.
            this.patch(id, { percent: 0, speed: null, eta: null })
            this.spawnJob(id, req, true)
            return
          }
          this.patch(id, {
            state: 'error',
            error: reason ?? `yt-dlp exited with code ${code}`
          })
          logger.error('Download failed', id, reason ?? `exit code ${code}`)
        }
      }
      this.finish(id)
    })
  }

  /**
   * Accumulates stdout and dispatches only complete, newline-terminated lines.
   * yt-dlp emits progress as discrete `--newline` lines, but Node delivers stdout
   * in arbitrary chunks that can split a line in two; parsing raw chunks would
   * silently drop those progress/destination lines.
   */
  private handleChunk(id: string, chunk: string): void {
    const buffered = (this.stdoutBuffers.get(id) ?? '') + chunk
    const lines = buffered.split('\n')
    // The last element is an incomplete line (no trailing newline yet); keep it.
    const remainder = lines.pop() ?? ''
    this.stdoutBuffers.set(id, remainder)
    for (const line of lines) this.handleLine(id, line)
  }

  private handleLine(id: string, line: string): void {
    const trimmed = line.trim()
    if (!trimmed) return
    // yt-dlp's --progress-template consumes the `download:` selector, so each
    // progress line is emitted as `progress:{...json...}`.
    if (trimmed.startsWith('progress:')) {
      try {
        const data = JSON.parse(trimmed.slice('progress:'.length))
        this.patch(id, {
          state: 'downloading',
          percent: parsePercent(data.percent ?? '0'),
          speed: cleanField(data.speed),
          eta: cleanField(data.eta)
        })
      } catch {
        // ignore malformed progress lines
      }
      return
    }
    // The merged/extracted file is the real artifact. Capture its final path
    // (the per-stream `[download] Destination` files are deleted after merge).
    const merger = trimmed.match(/^\[Merger\] Merging formats into "(.+)"$/)
    if (merger) {
      logger.info('Merging formats', id, merger[1])
      this.patch(id, { state: 'processing', outputPath: merger[1] })
      return
    }
    const extractAudio = trimmed.match(/^\[ExtractAudio\] Destination: (.+)$/)
    if (extractAudio) {
      logger.info('Extracting audio', id, extractAudio[1])
      this.patch(id, { state: 'processing', outputPath: extractAudio[1] })
      return
    }
    if (
      trimmed.includes('[Merger]') ||
      trimmed.includes('[ExtractAudio]') ||
      trimmed.includes('[VideoRemuxer]')
    ) {
      this.patch(id, { state: 'processing' })
    } else if (trimmed.startsWith('[download] Destination:')) {
      this.patch(id, { outputPath: trimmed.replace('[download] Destination:', '').trim() })
    }
  }

  private finish(id: string): void {
    this.running.delete(id)
    this.lastError.delete(id)
    this.retried.delete(id)
    this.stdoutBuffers.delete(id)
    this.requests.delete(id)
    this.pump()
  }

  private patch(id: string, partial: Partial<DownloadJob>): void {
    const job = this.jobs.get(id)
    if (!job) return
    // Once a job is finished, ignore any late stdout that would revive it back
    // into an active state (e.g. a buffered progress line arriving after close).
    if (!isActiveState(job.state) && partial.state && isActiveState(partial.state)) {
      return
    }
    Object.assign(job, partial)
    this.emitUpdate(job)
  }

  private emitUpdate(job: DownloadJob): void {
    this.emit('update', { ...job })
  }
}

function cleanField(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed && trimmed !== 'NA' ? trimmed : null
}

let manager: DownloadManager | null = null

export function downloadManager(): DownloadManager {
  if (!manager) manager = new DownloadManager()
  return manager
}
