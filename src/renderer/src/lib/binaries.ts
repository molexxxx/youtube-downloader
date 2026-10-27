import type { FfmpegStatus, SelfTestReport, YtdlpStatus } from '@shared/types'
import { formatBytes } from './format'

/** How a managed binary's state reads in the UI. */
export interface BinaryLine {
  text: string
  tone: 'muted' | 'busy' | 'ok' | 'warn' | 'error'
  /** Download progress 0-100 while it is known, else null. */
  percent: number | null
  busy: boolean
}

function percentOf(received: number, total: number | null): number | null {
  if (!total || total <= 0) return null
  return Math.min(100, Math.round((received / total) * 100))
}

/** Minutes, hours, or days since `at`, for "checked 3h ago". */
export function formatSince(at: number | null, now = Date.now()): string {
  if (at == null) return 'never'
  const mins = Math.floor((now - at) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function describeYtdlp(status: YtdlpStatus, now = Date.now()): BinaryLine {
  const state = status.state
  switch (state.kind) {
    case 'checking':
      return {
        text: 'Checking for a new release…',
        tone: 'busy',
        percent: null,
        busy: true
      }
    case 'updating': {
      if (state.phase === 'verifying') {
        return {
          text: `Verifying ${state.version}…`,
          tone: 'busy',
          percent: 100,
          busy: true
        }
      }
      if (state.phase === 'waiting') {
        return {
          text: `${state.version} is verified and installs once yt-dlp stops running`,
          tone: 'busy',
          percent: 100,
          busy: true
        }
      }
      const percent = percentOf(state.receivedBytes, state.totalBytes)
      return {
        text: `Downloading ${state.version}…${percent === null ? '' : ` ${percent}%`}`,
        tone: 'busy',
        percent,
        busy: true
      }
    }
    case 'updated':
      return {
        text: state.from ? `Updated from ${state.from}` : 'Installed and verified',
        tone: 'ok',
        percent: null,
        busy: false
      }
    case 'up-to-date':
      return { text: 'Up to date', tone: 'ok', percent: null, busy: false }
    case 'failed':
      return { text: state.reason, tone: 'error', percent: null, busy: false }
    default:
      if (!status.installed) {
        return { text: 'Not installed', tone: 'warn', percent: null, busy: false }
      }
      if (status.source === 'system') {
        return {
          text: 'On this computer; its own installer (pip, Homebrew, winget) keeps it updated',
          tone: 'muted',
          percent: null,
          busy: false
        }
      }
      return {
        text:
          status.lastCheckAt === null
            ? 'Not checked yet'
            : `Checked ${formatSince(status.lastCheckAt, now)}`,
        tone: 'muted',
        percent: null,
        busy: false
      }
  }
}

/** Whether the build in use is the one this app version pins. */
export function ffmpegIsPinned(status: FfmpegStatus): boolean {
  return status.version !== null && status.version === status.pinned?.version
}

export function describeFfmpeg(status: FfmpegStatus): BinaryLine {
  const state = status.state
  if (state.kind === 'installing') {
    if (state.phase === 'downloading') {
      return {
        text: `Downloading FFmpeg ${state.version}… ${formatBytes(state.receivedBytes)} of ${formatBytes(state.totalBytes)}`,
        tone: 'busy',
        percent: percentOf(state.receivedBytes, state.totalBytes),
        busy: true
      }
    }
    return {
      text:
        state.phase === 'extracting'
          ? `Extracting FFmpeg ${state.version}…`
          : `Verifying FFmpeg ${state.version}…`,
      tone: 'busy',
      percent: 100,
      busy: true
    }
  }
  if (state.kind === 'failed') {
    return { text: state.reason, tone: 'error', percent: null, busy: false }
  }
  if (!status.installed) {
    return { text: 'Not installed', tone: 'warn', percent: null, busy: false }
  }
  if (status.source === 'system') {
    return {
      text: 'On this computer; its own installer keeps it updated',
      tone: 'muted',
      percent: null,
      busy: false
    }
  }
  if (!ffmpegIsPinned(status) && status.pinned) {
    return {
      text: `FFmpeg ${status.pinned.version} installs in the background; the current build is used until then`,
      tone: 'busy',
      percent: null,
      busy: false
    }
  }
  return {
    text: 'Pinned to this app version; new builds arrive with app updates',
    tone: 'muted',
    percent: null,
    busy: false
  }
}

/** A self-test as one line: passed, passed with features that would not work, or the first required failure. */
export function selfTestSummary(report: SelfTestReport | null): {
  text: string
  tone: 'muted' | 'ok' | 'warn' | 'error'
} {
  if (report === null) return { text: 'Not self-tested yet', tone: 'muted' }
  const failedRequired = report.checks.find((c) => c.required && !c.ok)
  if (failedRequired) return { text: `Failed: ${failedRequired.label}`, tone: 'error' }
  const limited = report.checks.filter((c) => !c.ok).length
  if (limited > 0) {
    return {
      text: `Passed, but ${limited} optional ${limited === 1 ? 'feature is' : 'features are'} unavailable`,
      tone: 'warn'
    }
  }
  return { text: `Passed all ${report.checks.length} checks`, tone: 'ok' }
}

/** Where a binary in use comes from, as Settings and setup name it. */
export function sourceLabel(source: 'app' | 'system' | null): string {
  if (source === 'system') return 'On this computer'
  if (source === 'app') return 'Managed by the app'
  return 'Not installed'
}
