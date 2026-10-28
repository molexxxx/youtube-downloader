export const REPO_URL = 'https://github.com/molexxxx/youtube-downloader'
export const RELEASES_URL = `${REPO_URL}/releases`
export const LATEST_URL = `${RELEASES_URL}/latest`
const API_URL =
  'https://api.github.com/repos/molexxxx/youtube-downloader/releases?per_page=100'

export type Platform = 'windows' | 'mac' | 'linux' | 'other'
export type InstallerKind = 'exe' | 'dmg' | 'deb' | 'rpm'

export interface GitHubAsset {
  name: string
  size: number
  download_count: number
  browser_download_url: string
}

export interface GitHubRelease {
  tag_name: string
  html_url: string
  published_at: string | null
  body: string | null
  draft: boolean
  prerelease: boolean
  assets: GitHubAsset[]
}

export interface Installer {
  kind: InstallerKind
  platform: Exclude<Platform, 'other'>
  name: string
  url: string
  size: number
}

export interface NoteBlock {
  type: 'heading' | 'item' | 'text'
  text: string
}

export interface ReleaseSummary {
  tag: string
  url: string
  publishedAt: string | null
  installers: Installer[]
  highlights: NoteBlock[]
  downloads: number
  releases: number
}

const INSTALLERS: {
  kind: InstallerKind
  platform: Installer['platform']
  pattern: RegExp
}[] = [
  { kind: 'exe', platform: 'windows', pattern: /-Windows-Setup\.exe$/ },
  { kind: 'dmg', platform: 'mac', pattern: /-macOS-Installer\.dmg$/ },
  { kind: 'deb', platform: 'linux', pattern: /-Linux-Installer\.deb$/ },
  { kind: 'rpm', platform: 'linux', pattern: /-Linux-Installer\.rpm$/ }
]

/** Installers and updater archives; update metadata (.yml) and blockmaps are not downloads. */
const COUNTED = /\.(exe|dmg|pkg|deb|rpm|AppImage|zip)$/

/** Reads every published release, following GitHub's pagination. */
export async function fetchReleases(
  token?: string,
  signal?: AbortSignal
): Promise<GitHubRelease[]> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const releases: GitHubRelease[] = []
  let url: string | null = API_URL
  for (let page = 0; url && page < 10; page++) {
    const res = await fetch(url, { headers, signal })
    if (!res.ok) throw new Error(`GitHub API responded ${res.status}`)
    releases.push(...((await res.json()) as GitHubRelease[]))
    url = nextPage(res.headers.get('link'))
  }
  return releases
}

export function nextPage(link: string | null): string | null {
  const match = link?.match(/<([^>]+)>;\s*rel="next"/)
  return match ? match[1] : null
}

/** Reduces the release list to the latest stable release plus lifetime download totals. */
export function summarize(releases: GitHubRelease[]): ReleaseSummary | null {
  const published = releases.filter((release) => !release.draft)
  const latest = published.find((release) => !release.prerelease)
  if (!latest) return null
  const downloads = published.reduce(
    (total, release) =>
      total +
      release.assets.reduce(
        (sum, asset) => (COUNTED.test(asset.name) ? sum + asset.download_count : sum),
        0
      ),
    0
  )
  return {
    tag: latest.tag_name,
    url: latest.html_url,
    publishedAt: latest.published_at,
    installers: INSTALLERS.flatMap(({ kind, platform, pattern }) => {
      const asset = latest.assets.find((candidate) => pattern.test(candidate.name))
      return asset
        ? [
            {
              kind,
              platform,
              name: asset.name,
              url: asset.browser_download_url,
              size: asset.size
            }
          ]
        : []
    }),
    highlights: parseHighlights(latest.body ?? ''),
    downloads,
    releases: published.length
  }
}

/** Extracts the "Highlights" section of the release notes as headings, list items, and paragraphs. */
export function parseHighlights(body: string): NoteBlock[] {
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex((line) => /^##\s+Highlights\s*$/i.test(line.trim()))
  if (start === -1) return []
  const blocks: NoteBlock[] = []
  for (const raw of lines.slice(start + 1)) {
    const line = raw.trim()
    if (/^##\s/.test(line)) break
    if (!line) continue
    const heading = line.match(/^#{3,6}\s+(.*)$/)
    const item = line.match(/^[-*]\s+(.*)$/)
    if (heading) blocks.push({ type: 'heading', text: heading[1] })
    else if (item) blocks.push({ type: 'item', text: item[1] })
    else {
      const last = blocks[blocks.length - 1]
      if (last && last.type !== 'heading') last.text += ` ${line}`
      else blocks.push({ type: 'text', text: line })
    }
  }
  return blocks
}

export function formatSize(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

const DAY = 86_400_000

/** Describes a publish date relative to now: today, yesterday, a few days ago, or the date. */
export function formatPublished(iso: string, now = new Date()): string {
  const date = new Date(iso)
  const days = Math.floor(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())) /
      DAY
  )
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return `on ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)}`
}
