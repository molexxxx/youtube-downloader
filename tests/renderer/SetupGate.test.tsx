import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import {
  SetupGate,
  initialChoice,
  setupPassed
} from '@renderer/components/setup/SetupGate'
import { useAppStore } from '@renderer/stores/appStore'
import type { AppConfig, BinariesScan, SelfTestReport } from '@shared/types'
import { baseBinaries, installMockApi } from './helpers/mockApi'

let api: ReturnType<typeof installMockApi>

function report(passed: boolean, path = '/usr/bin/yt-dlp'): SelfTestReport {
  return {
    path,
    version: '2026.10.26',
    at: 1,
    passed,
    checks: [
      {
        id: 'starts',
        label: 'yt-dlp starts',
        required: true,
        ok: true,
        detail: 'Reports version'
      },
      {
        id: 'js-runtime',
        label: 'JavaScript runtime for YouTube',
        required: true,
        ok: passed,
        detail: passed ? 'Uses node-24' : 'yt-dlp does not know --js-runtimes'
      }
    ]
  }
}

const NOTHING_FOUND: BinariesScan = {
  ytdlp: null,
  ffmpeg: null,
  ytdlpRelease: { version: '2026.10.26', bytes: 23_575_744 }
}

const tested = baseBinaries({
  ytdlp: { selfTest: report(true, '/yt') },
  ffmpeg: { selfTest: report(true, '/ff') }
})

beforeEach(() => {
  api = installMockApi()
  useAppStore.setState({
    binaries: baseBinaries({
      ytdlp: { installed: false, version: null, source: null },
      ffmpeg: { installed: false, version: null, source: null }
    }),
    binariesReady: false,
    setupOpen: false,
    config: { ytdlpSource: 'app', ffmpegSource: 'app', setupComplete: false } as AppConfig
  })
})
afterEach(() => cleanup())

describe('SetupGate', () => {
  it('scans this computer, then offers the app copies with what they download', async () => {
    api.binaries.scan.mockResolvedValue(NOTHING_FOUND)
    render(<SetupGate />)
    expect(
      screen.getByText('Looking for yt-dlp and FFmpeg on this computer…')
    ).toBeInTheDocument()
    expect(
      await screen.findByText(/Download yt-dlp 2026\.10\.26 \(22 MB\) from GitHub/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Download FFmpeg 9\.0\.2 \(185 MB\) from BtbN FFmpeg Builds/)
    ).toBeInTheDocument()
    expect(
      screen.getByText("No yt-dlp found on this computer's PATH.")
    ).toBeInTheDocument()
    expect(api.binaries.scan).toHaveBeenCalledTimes(1)
  })

  it('offers a passing copy on this computer, and refuses a failing one with the reason', async () => {
    api.binaries.scan.mockResolvedValue({
      ...NOTHING_FOUND,
      ytdlp: { path: '/usr/bin/yt-dlp', version: '2026.10.26', report: report(true) },
      ffmpeg: {
        path: '/usr/bin/ffmpeg',
        version: '7.1',
        report: report(false, '/usr/bin/ffmpeg')
      }
    })
    render(<SetupGate />)
    const ytdlpSystem = await screen.findByRole('radio', {
      name: /Use yt-dlp 2026\.10\.26 on this computer/
    })
    expect(ytdlpSystem).toBeEnabled()
    fireEvent.click(ytdlpSystem)
    expect(ytdlpSystem).toHaveAttribute('aria-checked', 'true')
    expect(
      screen.getByRole('radio', { name: /Use FFmpeg 7\.1 on this computer/ })
    ).toBeDisabled()
    expect(screen.getByText('Failed: JavaScript runtime for YouTube')).toBeInTheDocument()
    expect(screen.getByText('yt-dlp does not know --js-runtimes')).toBeInTheDocument()
  })

  it('saves the choices, installs, self-tests both, and starts once everything passes', async () => {
    api.binaries.scan.mockResolvedValue({
      ...NOTHING_FOUND,
      ytdlp: { path: '/usr/bin/yt-dlp', version: '2026.10.26', report: report(true) }
    })
    api.binaries.selfTest.mockResolvedValue(tested)
    render(<SetupGate />)
    fireEvent.click(
      await screen.findByRole('radio', {
        name: /Use yt-dlp 2026\.10\.26 on this computer/
      })
    )
    fireEvent.click(screen.getByText('Install and test'))
    await waitFor(() =>
      expect(api.config.set).toHaveBeenCalledWith({
        ytdlpSource: 'system',
        ffmpegSource: 'app'
      })
    )
    expect(api.binaries.bootstrap).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(api.binaries.selfTest).toHaveBeenCalledWith('ytdlp'))
    expect(api.binaries.selfTest).toHaveBeenCalledWith('ffmpeg')
    fireEvent.click(await screen.findByText('Start using YouTube Downloader'))
    await waitFor(() =>
      expect(api.config.set).toHaveBeenCalledWith({ setupComplete: true })
    )
    expect(useAppStore.getState().setupOpen).toBe(false)
  })

  it('offers a retry instead of starting when a required check fails', async () => {
    api.binaries.scan.mockResolvedValue(NOTHING_FOUND)
    api.binaries.selfTest.mockResolvedValue(
      baseBinaries({
        ytdlp: { selfTest: report(false, '/yt') },
        ffmpeg: { selfTest: report(true, '/ff') }
      })
    )
    render(<SetupGate />)
    fireEvent.click(await screen.findByText('Install and test'))
    expect(await screen.findByText('Retry')).toBeInTheDocument()
    expect(screen.queryByText('Start using YouTube Downloader')).toBeNull()
    expect(
      screen.getAllByText('Failed: JavaScript runtime for YouTube').length
    ).toBeGreaterThan(0)
    fireEvent.click(screen.getByText('Retry'))
    await waitFor(() => expect(api.binaries.bootstrap).toHaveBeenCalledTimes(2))
  })

  it('can be closed only when it was opened from Settings', async () => {
    api.binaries.scan.mockResolvedValue(NOTHING_FOUND)
    const { unmount } = render(<SetupGate />)
    await screen.findByText('Install and test')
    expect(screen.queryByLabelText('Close setup')).toBeNull()
    unmount()

    useAppStore.setState({
      binaries: tested,
      binariesReady: true,
      setupOpen: true,
      config: {
        ytdlpSource: 'app',
        ffmpegSource: 'app',
        setupComplete: true
      } as AppConfig
    })
    render(<SetupGate />)
    fireEvent.click(await screen.findByLabelText('Close setup'))
    expect(useAppStore.getState().setupOpen).toBe(false)
  })
})

describe('setup helpers', () => {
  it('starts from the saved source only while that copy is still found and passing', () => {
    const scan = {
      ...NOTHING_FOUND,
      ytdlp: { path: '/y', version: '1', report: report(true) },
      ffmpeg: { path: '/f', version: '1', report: report(false) }
    }
    expect(initialChoice(scan, { ytdlp: 'system', ffmpeg: 'system' })).toEqual({
      ytdlp: 'system',
      ffmpeg: 'app'
    })
    expect(initialChoice(NOTHING_FOUND, { ytdlp: 'system' })).toEqual({
      ytdlp: 'app',
      ffmpeg: 'app'
    })
  })

  it('passes only with both installed and both self-tests passed', () => {
    expect(setupPassed(tested)).toBe(true)
    expect(setupPassed(baseBinaries())).toBe(false)
    expect(setupPassed(null)).toBe(false)
  })
})
