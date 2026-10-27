import { describe, expect, it, vi } from 'vitest'

vi.mock('@main/config', () => ({
  getConfig: () => ({
    downloadDir: '/downloads',
    outputTemplate: '%(title)s.%(ext)s',
    maxConcurrentDownloads: 3,
    videoContainer: 'mp4',
    embedThumbnail: true,
    embedMetadata: true,
    embedChapters: false,
    writeSubtitles: true,
    subtitleLangs: ['en', 'es'],
    sponsorBlock: true,
    useDownloadArchive: false,
    cookiesFromBrowser: null
  })
}))

vi.mock('@main/binaries/ffmpeg-binary', () => ({ ffmpegDir: () => '/bin' }))
vi.mock('@main/binaries/ytdlp-binary', () => ({
  ytdlpPath: () => '/bin/yt-dlp',
  trackYtdlp: <T>(child: T): T => child,
  managedEngine: <T>(engine: T): T => engine,
  ytdlpRuntimeArgs: () => ['--js-runtimes', 'node:/electron'],
  ytdlpRuntimeFlags: () => ({ jsRuntimes: 'node:/electron' }),
  ytdlpEnv: () => ({ ELECTRON_RUN_AS_NODE: '1' })
}))

import { join } from 'path'
import { getConfig } from '@main/config'
import { buildArgs } from '@main/ytdlp/downloader'

describe('buildArgs', () => {
  it('builds video download args with auto format', () => {
    const args = buildArgs({ url: 'https://x', kind: 'video' })
    expect(args).toContain('https://x')
    expect(args).toContain('bestvideo+bestaudio/best')
    expect(args).toContain('--merge-output-format')
    expect(args).toContain('--embed-thumbnail')
  })

  it('runs hermetically by ignoring any global yt-dlp config', () => {
    const args = buildArgs({ url: 'https://x', kind: 'video' })
    expect(args).toContain('--ignore-config')
  })

  it('names the JavaScript runtime for YouTube and keeps TLS validation on', () => {
    const args = buildArgs({ url: 'https://x', kind: 'video' })
    expect(args[args.indexOf('--js-runtimes') + 1]).toBe('node:/electron')
    expect(args).not.toContain('--no-check-certificates')
  })

  it('asks yt-dlp for UTF-8 output and the final file path without going quiet', () => {
    const args = buildArgs({ url: 'https://x', kind: 'audio' })
    expect(args[args.indexOf('--encoding') + 1]).toBe('utf-8')
    expect(args[args.indexOf('--print') + 1]).toBe('after_move:filepath:%(filepath)s')
    expect(args).toContain('--no-quiet')
  })

  it('keeps the download archive in the download folder, not the process working directory', () => {
    const args = buildArgs(
      { url: 'https://x', kind: 'video' },
      {
        ...getConfig(),
        useDownloadArchive: true
      }
    )
    expect(args[args.indexOf('--download-archive') + 1]).toBe(
      join('/downloads', 'archive.txt')
    )
  })

  it('uses an explicit format id paired with best audio and mp4 merge', () => {
    const args = buildArgs({ url: 'https://x', kind: 'video', formatId: '137' })
    const idx = args.indexOf('--format')
    expect(args[idx + 1]).toBe('137+bestaudio/137/best')
    const mergeIdx = args.indexOf('--merge-output-format')
    expect(args[mergeIdx + 1]).toBe('mp4')
  })

  it('caps the height when a preset resolution applies without a format id', () => {
    const args = buildArgs({ url: 'https://x', kind: 'video', maxHeight: 720 })
    expect(args[args.indexOf('--format') + 1]).toBe(
      'bestvideo[height<=720]+bestaudio/best[height<=720]/best'
    )
  })

  it('lets an explicit format id win over a height cap', () => {
    const args = buildArgs({
      url: 'https://x',
      kind: 'video',
      formatId: '137',
      maxHeight: 720
    })
    expect(args[args.indexOf('--format') + 1]).toBe('137+bestaudio/137/best')
  })

  it('ignores a height cap that is not a positive integer', () => {
    for (const maxHeight of [0, -720, 720.5, Number.NaN]) {
      const args = buildArgs({ url: 'https://x', kind: 'video', maxHeight })
      expect(args[args.indexOf('--format') + 1]).toBe('bestvideo+bestaudio/best')
    }
  })

  it('defaults the container to the config value', () => {
    const args = buildArgs({ url: 'https://x', kind: 'video' })
    const mergeIdx = args.indexOf('--merge-output-format')
    expect(args[mergeIdx + 1]).toBe('mp4')
    const remuxIdx = args.indexOf('--remux-video')
    expect(args[remuxIdx + 1]).toBe('mp4')
  })

  it('honors an explicit mkv container request', () => {
    const args = buildArgs({ url: 'https://x', kind: 'video', container: 'mkv' })
    const mergeIdx = args.indexOf('--merge-output-format')
    expect(args[mergeIdx + 1]).toBe('mkv')
    const remuxIdx = args.indexOf('--remux-video')
    expect(args[remuxIdx + 1]).toBe('mkv')
  })

  it('builds audio extraction args', () => {
    const args = buildArgs({
      url: 'https://x',
      kind: 'audio',
      audioFormat: 'flac',
      audioBitrate: 320
    })
    expect(args).toContain('--extract-audio')
    const fmtIdx = args.indexOf('--audio-format')
    expect(args[fmtIdx + 1]).toBe('flac')
    const qIdx = args.indexOf('--audio-quality')
    expect(args[qIdx + 1]).toBe('320K')
  })

  it('embeds the thumbnail for supported audio formats', () => {
    const args = buildArgs({ url: 'https://x', kind: 'audio', audioFormat: 'mp3' })
    expect(args).toContain('--embed-thumbnail')
  })

  it('skips thumbnail embedding for WAV audio (yt-dlp cannot embed into WAV)', () => {
    const args = buildArgs({ url: 'https://x', kind: 'audio', audioFormat: 'wav' })
    expect(args).not.toContain('--embed-thumbnail')
    // Metadata embedding is unaffected.
    expect(args).toContain('--embed-metadata')
  })

  it('includes subtitle and sponsorblock flags from config', () => {
    const args = buildArgs({ url: 'https://x', kind: 'video' })
    expect(args).toContain('--write-subs')
    const subIdx = args.indexOf('--sub-langs')
    expect(args[subIdx + 1]).toBe('en,es')
    expect(args).toContain('--sponsorblock-remove')
  })

  it('passes playlist item selection', () => {
    const args = buildArgs({ url: 'https://x', kind: 'video', playlistItems: '1-3' })
    const idx = args.indexOf('--playlist-items')
    expect(args[idx + 1]).toBe('1-3')
  })

  it('forces a single video with --no-playlist when requested', () => {
    const args = buildArgs({ url: 'https://x', kind: 'video', noPlaylist: true })
    expect(args).toContain('--no-playlist')
  })

  it('omits --no-playlist for a normal playlist download', () => {
    const args = buildArgs({ url: 'https://x', kind: 'video' })
    expect(args).not.toContain('--no-playlist')
  })
})
