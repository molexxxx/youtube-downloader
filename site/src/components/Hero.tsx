import { Download } from 'lucide-react'
import {
  formatCount,
  formatPublished,
  formatSize,
  LATEST_URL,
  type Platform,
  type ReleaseSummary
} from '../release'
import { PRIMARY } from './ReleaseDetails'
import { Window } from './Window'

const LABELS: Record<Platform, string> = {
  windows: 'Download for Windows',
  mac: 'Download for macOS',
  linux: 'Download for Linux',
  other: 'Choose your system'
}

const NOTES: Record<Platform, string> = {
  windows:
    'Windows 10 or 11, 64-bit. The installer is not code-signed yet, so SmartScreen may ask you to choose More info, then Run anyway.',
  mac: 'Apple Silicon (M1 or later) and macOS 13 or later. Signed and notarized by Apple.',
  linux: '64-bit (x64) .deb package. An .rpm is in the release list too.',
  other:
    'YouTube Downloader is a desktop app. Open this page on your computer to get the right file.'
}

interface HeroProps {
  release: ReleaseSummary | null
  platform: Platform
}

export function Hero({ release, platform }: HeroProps) {
  const kind = PRIMARY[platform]
  const installer = kind
    ? release?.installers.find((candidate) => candidate.kind === kind)
    : undefined
  const href = installer?.url ?? (kind ? LATEST_URL : '#install')
  return (
    <div className="hero">
      <h1 id="hero-title">
        <span>Paste a YouTube link.</span> <span>Pick a preset.</span>{' '}
        <span>Get the file.</span>
      </h1>
      <p className="lead">
        Free and open source for Windows, macOS, and Linux. The same app runs your own
        Discord music bot.
      </p>
      <div className="hero-actions">
        <a className="key key-red" href={href}>
          <Download size={20} strokeWidth={2.25} aria-hidden="true" />
          {LABELS[platform]}
          {installer && (
            <span className="key-size numeral">{formatSize(installer.size)}</span>
          )}
        </a>
        {kind && (
          <a className="key key-line" href="#install">
            Other systems
          </a>
        )}
      </div>
      {release && (
        <p className="hero-release">
          Latest release <strong>{release.tag}</strong>
          {release.publishedAt && `, published ${formatPublished(release.publishedAt)}`}
          <span aria-hidden="true"> · </span>
          <span className="nowrap">
            <span className="numeral">{formatCount(release.downloads)}</span> downloads
          </span>
        </p>
      )}
      <p className="hero-note">{NOTES[platform]}</p>
      <Window
        name="hero-dark"
        eager
        className="hero-window"
        sizes="(min-width: 1180px) calc(100vw - 520px), calc(100vw - 40px)"
      />
    </div>
  )
}
