import { describe, expect, it } from 'vitest'
import {
  describeFfmpeg,
  describeYtdlp,
  ffmpegIsPinned,
  formatSince,
  selfTestSummary,
  sourceLabel
} from '@renderer/lib/binaries'
import { baseBinaries } from './helpers/mockApi'

const NOW = Date.UTC(2026, 9, 27, 12)

describe('describeYtdlp', () => {
  const ytdlp = (state: unknown, extra = {}) =>
    baseBinaries({ ytdlp: { state, ...extra } as never }).ytdlp

  it('reads every updater state', () => {
    expect(describeYtdlp(ytdlp({ kind: 'checking' }))).toMatchObject({
      tone: 'busy',
      busy: true
    })
    expect(
      describeYtdlp(
        ytdlp({
          kind: 'updating',
          phase: 'downloading',
          version: 'v',
          receivedBytes: 1,
          totalBytes: null
        })
      )
    ).toMatchObject({ text: 'Downloading v…', percent: null })
    expect(
      describeYtdlp(
        ytdlp({
          kind: 'updating',
          phase: 'waiting',
          version: 'v',
          receivedBytes: 1,
          totalBytes: 1
        })
      ).text
    ).toBe('v is verified and installs once yt-dlp stops running')
    expect(
      describeYtdlp(
        ytdlp({
          kind: 'updating',
          phase: 'verifying',
          version: 'v',
          receivedBytes: 1,
          totalBytes: 1
        })
      ).text
    ).toBe('Verifying v…')
    expect(describeYtdlp(ytdlp({ kind: 'updated', from: null, to: 'v' })).text).toBe(
      'Installed and verified'
    )
    expect(describeYtdlp(ytdlp({ kind: 'up-to-date' }))).toMatchObject({ tone: 'ok' })
    expect(
      describeYtdlp(ytdlp({ kind: 'failed', problem: 'disk', reason: 'No space', at: 1 }))
    ).toMatchObject({ text: 'No space', tone: 'error' })
  })

  it('reads an idle copy by when it was last checked, or as missing', () => {
    expect(describeYtdlp(ytdlp({ kind: 'idle' }), NOW).text).toBe('Not checked yet')
    expect(
      describeYtdlp(ytdlp({ kind: 'idle' }, { lastCheckAt: NOW - 3 * 3600_000 }), NOW)
        .text
    ).toBe('Checked 3h ago')
    expect(describeYtdlp(ytdlp({ kind: 'idle' }, { installed: false }))).toMatchObject({
      text: 'Not installed',
      tone: 'warn'
    })
  })
})

describe('describeFfmpeg', () => {
  it('reads the install phases with sizes', () => {
    const downloading = baseBinaries({
      ffmpeg: {
        state: {
          kind: 'installing',
          phase: 'downloading',
          version: '9.0.2',
          receivedBytes: 1024 * 1024,
          totalBytes: 4 * 1024 * 1024
        }
      }
    }).ffmpeg
    expect(describeFfmpeg(downloading)).toEqual({
      text: 'Downloading FFmpeg 9.0.2… 1.0 MB of 4.0 MB',
      tone: 'busy',
      percent: 25,
      busy: true
    })
    const extracting = baseBinaries({
      ffmpeg: {
        state: {
          kind: 'installing',
          phase: 'extracting',
          version: '9.0.2',
          receivedBytes: 1,
          totalBytes: 1
        }
      }
    }).ffmpeg
    expect(describeFfmpeg(extracting).text).toBe('Extracting FFmpeg 9.0.2…')
  })

  it('says when an older build is in use until the pinned one installs', () => {
    const older = baseBinaries({
      ffmpeg: { version: '8.0', build: 'btbn-n8.0-1-gabc' }
    }).ffmpeg
    expect(ffmpegIsPinned(older)).toBe(false)
    expect(describeFfmpeg(older).text).toBe(
      'FFmpeg 9.0.2 installs in the background; the current build is used until then'
    )
    const pinned = baseBinaries().ffmpeg
    expect(ffmpegIsPinned(pinned)).toBe(true)
    expect(describeFfmpeg(pinned).tone).toBe('muted')
    expect(
      describeFfmpeg(baseBinaries({ ffmpeg: { installed: false, version: null } }).ffmpeg)
        .text
    ).toBe('Not installed')
  })
})

describe('formatSince', () => {
  it('reads minutes, hours, and days', () => {
    expect(formatSince(null, NOW)).toBe('never')
    expect(formatSince(NOW - 10_000, NOW)).toBe('just now')
    expect(formatSince(NOW - 5 * 60_000, NOW)).toBe('5m ago')
    expect(formatSince(NOW - 2 * 86_400_000, NOW)).toBe('2d ago')
  })
})

describe('selfTestSummary', () => {
  const check = (id: string, required: boolean, ok: boolean) => ({
    id,
    label: `Check ${id}`,
    required,
    ok,
    detail: ''
  })
  const report = (checks: ReturnType<typeof check>[]) => ({
    path: '/x',
    version: '1',
    at: 1,
    passed: checks.every((c) => c.ok || !c.required),
    checks
  })

  it('reads a missing, a passing, a limited, and a failing report', () => {
    expect(selfTestSummary(null)).toEqual({ text: 'Not self-tested yet', tone: 'muted' })
    expect(
      selfTestSummary(report([check('a', true, true), check('b', false, true)]))
    ).toEqual({
      text: 'Passed all 2 checks',
      tone: 'ok'
    })
    expect(
      selfTestSummary(report([check('a', true, true), check('b', false, false)]))
    ).toEqual({
      text: 'Passed, but 1 optional feature is unavailable',
      tone: 'warn'
    })
    expect(
      selfTestSummary(report([check('a', true, false), check('b', true, false)]))
    ).toEqual({
      text: 'Failed: Check a',
      tone: 'error'
    })
  })

  it('names where a binary comes from, and says a system copy updates itself', () => {
    expect(sourceLabel('app')).toBe('Managed by the app')
    expect(sourceLabel('system')).toBe('On this computer')
    expect(sourceLabel(null)).toBe('Not installed')
    expect(
      describeFfmpeg(
        baseBinaries({ ffmpeg: { source: 'system', version: '7.1' } }).ffmpeg
      ).text
    ).toBe('On this computer; its own installer keeps it updated')
    expect(
      describeYtdlp(baseBinaries({ ytdlp: { source: 'system' } }).ytdlp).text
    ).toContain('On this computer')
  })
})
