import { Download } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  formatCount,
  formatPublished,
  formatSize,
  LATEST_URL,
  RELEASES_URL,
  type InstallerKind,
  type NoteBlock,
  type Platform,
  type ReleaseSummary
} from '../release'

const ROWS: { kind: InstallerKind; os: string; detail: string }[] = [
  { kind: 'exe', os: 'Windows', detail: 'x64 · Setup.exe' },
  { kind: 'dmg', os: 'macOS', detail: 'Apple Silicon · .dmg' },
  { kind: 'deb', os: 'Linux', detail: 'x64 · .deb' },
  { kind: 'rpm', os: 'Linux', detail: 'x64 · .rpm' }
]

export const PRIMARY: Record<Platform, InstallerKind | null> = {
  windows: 'exe',
  mac: 'dmg',
  linux: 'deb',
  other: null
}

interface ReleaseDetailsProps {
  release: ReleaseSummary | null
  platform: Platform
}

/** Latest version, lifetime downloads, an installer list with the visitor's file marked, and highlights. */
export function ReleaseDetails({ release, platform }: ReleaseDetailsProps) {
  const yours = PRIMARY[platform]
  const notes = release?.highlights.slice(0, 4) ?? []
  return (
    <>
      <h2 className="release-version">
        <span className="sr-only">Latest release </span>
        {release?.tag ?? 'Latest release'}
      </h2>
      <p className="release-meta">
        {release ? (
          <>
            {release.publishedAt
              ? `Latest release, published ${formatPublished(release.publishedAt)}`
              : 'Latest release'}
            <span aria-hidden="true"> · </span>
            <span className="nowrap">
              <span className="numeral">{formatCount(release.downloads)}</span> downloads
            </span>
          </>
        ) : (
          'Version details are on GitHub Releases.'
        )}
      </p>
      <ul className="installers">
        {ROWS.map(({ kind, os, detail }) => {
          const installer = release?.installers.find(
            (candidate) => candidate.kind === kind
          )
          const mine = kind === yours
          return (
            <li key={kind}>
              <a
                className="installer"
                data-mine={mine || undefined}
                href={installer?.url ?? LATEST_URL}
              >
                <span className="installer-name">
                  <strong>{os}</strong> {detail}
                </span>
                <span className="installer-size numeral">
                  {mine && <Download size={14} strokeWidth={2.25} aria-hidden="true" />}
                  {installer ? formatSize(installer.size) : 'GitHub'}
                </span>
                {mine && <span className="sr-only"> (for this computer)</span>}
              </a>
            </li>
          )
        })}
      </ul>
      {notes.length > 0 && (
        <div className="notes">
          <h3>What’s new in {release?.tag}</h3>
          <Notes blocks={notes} />
        </div>
      )}
      <p className="release-links">
        {release && <a href={release.url}>Full release notes</a>}
        <a href={RELEASES_URL}>All releases</a>
      </p>
    </>
  )
}

function Notes({ blocks }: { blocks: NoteBlock[] }) {
  const out: ReactNode[] = []
  let items: ReactNode[] = []
  const flush = () => {
    if (items.length) out.push(<ul key={`list-${out.length}`}>{items}</ul>)
    items = []
  }
  blocks.forEach((block, index) => {
    if (block.type === 'item') {
      items.push(<li key={index}>{inline(block.text)}</li>)
      return
    }
    flush()
    out.push(
      block.type === 'heading' ? (
        <p key={index} className="notes-heading">
          {inline(block.text)}
        </p>
      ) : (
        <p key={index}>{inline(block.text)}</p>
      )
    )
  })
  flush()
  return <>{out}</>
}

/** Renders the Markdown that release notes use inline: bold, code, and links. */
export function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  const pattern = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > last) parts.push(text.slice(last, index))
    if (match[1]) parts.push(<strong key={index}>{match[1]}</strong>)
    else if (match[2]) parts.push(<code key={index}>{match[2]}</code>)
    else
      parts.push(
        <a key={index} href={match[4]}>
          {match[3]}
        </a>
      )
    last = index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}
