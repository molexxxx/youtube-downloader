import { describe, expect, it } from 'vitest'
import {
  formatCount,
  formatPublished,
  formatSize,
  nextPage,
  parseHighlights,
  summarize,
  type GitHubAsset,
  type GitHubRelease
} from '../../site/src/release'

const asset = (name: string, download_count = 0, size = 1): GitHubAsset => ({
  name,
  size,
  download_count,
  browser_download_url: `https://example.test/${name}`
})

const release = (
  tag: string,
  assets: GitHubAsset[],
  extra: Partial<GitHubRelease> = {}
) => ({
  tag_name: tag,
  html_url: `https://example.test/${tag}`,
  published_at: '2026-10-27T21:39:48Z',
  body: '',
  draft: false,
  prerelease: false,
  assets,
  ...extra
})

describe('summarize', () => {
  it('picks the newest stable release and maps each installer by file name', () => {
    const summary = summarize([
      release('v2.0.0-beta.1', [asset('YouTube-Downloader-2.0.0-Windows-Setup.exe')], {
        prerelease: true
      }),
      release('v1.4.22', [
        asset('latest.yml'),
        asset('YouTube-Downloader-1.4.22-Windows-Setup.exe', 0, 117_420_451),
        asset('YouTube-Downloader-1.4.22-macOS-Installer.dmg', 0, 146_278_099),
        asset('YouTube-Downloader-1.4.22-macOS-Updater.zip'),
        asset('YouTube-Downloader-1.4.22-Linux-Installer.deb', 0, 110_357_560),
        asset('YouTube-Downloader-1.4.22-Linux-Installer.rpm', 0, 96_307_442)
      ])
    ])
    expect(summary?.tag).toBe('v1.4.22')
    expect(summary?.installers.map(({ kind, size }) => [kind, size])).toEqual([
      ['exe', 117_420_451],
      ['dmg', 146_278_099],
      ['deb', 110_357_560],
      ['rpm', 96_307_442]
    ])
  })

  it('counts installer and updater downloads across releases, not update metadata', () => {
    const summary = summarize([
      release('v1.1.0', [
        asset('latest.yml', 900),
        asset('a-Windows-Setup.exe', 10),
        asset('a-Windows-Setup.exe.blockmap', 50),
        asset('a-macOS-Updater.zip', 4)
      ]),
      release('v1.0.0', [asset('a.AppImage', 3), asset('a.pkg', 2), asset('a.rpm', 1)])
    ])
    expect(summary?.downloads).toBe(20)
    expect(summary?.releases).toBe(2)
  })

  it('ignores drafts and returns null without a stable release', () => {
    expect(summarize([release('v1.0.0', [], { draft: true })])).toBeNull()
    expect(summarize([])).toBeNull()
  })
})

describe('parseHighlights', () => {
  it('reads bullets until the next section', () => {
    const body = [
      '## Highlights',
      '',
      '- **A new app icon.** The flat red download icon now carries a blue bot badge.',
      '- **The right size on macOS.** It sits on the icon grid.',
      '',
      '## Features',
      '',
      '- Badge the app icons'
    ].join('\r\n')
    expect(parseHighlights(body)).toEqual([
      {
        type: 'item',
        text: '**A new app icon.** The flat red download icon now carries a blue bot badge.'
      },
      { type: 'item', text: '**The right size on macOS.** It sits on the icon grid.' }
    ])
  })

  it('keeps subheadings and joins wrapped paragraph lines', () => {
    const body =
      '## Highlights\n### A redesigned app\nEvery screen moves\nto a calmer layout.\n- Setup you can trust'
    expect(parseHighlights(body)).toEqual([
      { type: 'heading', text: 'A redesigned app' },
      { type: 'text', text: 'Every screen moves to a calmer layout.' },
      { type: 'item', text: 'Setup you can trust' }
    ])
  })

  it('returns nothing when the notes have no highlights', () => {
    expect(parseHighlights('## Fixes\n- Something')).toEqual([])
  })
})

describe('nextPage', () => {
  it("follows GitHub's Link header", () => {
    const link =
      '<https://api.github.com/repositories/1/releases?per_page=100&page=2>; rel="next", <https://api.github.com/repositories/1/releases?per_page=100&page=3>; rel="last"'
    expect(nextPage(link)).toBe(
      'https://api.github.com/repositories/1/releases?per_page=100&page=2'
    )
    expect(nextPage('<https://x.test/?page=1>; rel="prev"')).toBeNull()
    expect(nextPage(null)).toBeNull()
  })
})

describe('formatting', () => {
  it('formats sizes in decimal megabytes and counts with separators', () => {
    expect(formatSize(117_420_451)).toBe('117 MB')
    expect(formatSize(110_357_560)).toBe('110 MB')
    expect(formatCount(12_345)).toBe('12,345')
  })

  it('describes publish dates relative to today', () => {
    const now = new Date(2026, 9, 27, 18, 0)
    expect(formatPublished(new Date(2026, 9, 27, 9, 0).toISOString(), now)).toBe('today')
    expect(formatPublished(new Date(2026, 9, 26, 23, 0).toISOString(), now)).toBe(
      'yesterday'
    )
    expect(formatPublished(new Date(2026, 9, 23, 12, 0).toISOString(), now)).toBe(
      '4 days ago'
    )
    expect(formatPublished(new Date(2026, 8, 2, 12, 0).toISOString(), now)).toBe(
      'on Sep 2, 2026'
    )
  })
})
