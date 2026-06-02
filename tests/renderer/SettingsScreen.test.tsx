import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { SettingsScreen } from '@renderer/components/settings/SettingsScreen'
import { useAppStore } from '@renderer/stores/appStore'
import type { AppConfig, AppUpdateStatus, BinariesStatus, CookieInfo } from '@shared/types'
import { installMockApi } from './helpers/mockApi'

let api: ReturnType<typeof installMockApi>

const fullConfig = (overrides: Partial<AppConfig> = {}): AppConfig =>
  ({
    theme: 'dark',
    downloadDir: '/downloads',
    defaultPreset: 'best-mp4',
    videoContainer: 'mp4',
    maxConcurrentDownloads: 2,
    outputTemplate: '%(title)s.%(ext)s',
    playlistFetchLimit: 200,
    embedThumbnail: true,
    embedMetadata: true,
    embedChapters: true,
    writeSubtitles: false,
    subtitleLangs: ['en'],
    sponsorBlock: false,
    useDownloadArchive: false,
    cookiesFromBrowser: null,
    autoUpdateApp: true,
    autoUpdateBinaries: true,
    notifications: true,
    closeToTray: true,
    ...overrides
  }) as AppConfig

const binaries: BinariesStatus = {
  ytdlp: { name: 'yt-dlp', installed: true, path: '/yt', version: '2024.01' },
  ffmpeg: { name: 'ffmpeg', installed: true, path: '/ff', version: '6.0' }
}

const cookieInfo = (overrides: Partial<CookieInfo> = {}): CookieInfo =>
  ({
    detected: [{ name: 'chrome', label: 'Chrome' }],
    cached: false,
    effectiveBrowser: null,
    effectiveLabel: null,
    ageMs: null,
    ...overrides
  }) as CookieInfo

beforeEach(() => {
  api = installMockApi()
  api.cookies.info.mockResolvedValue(cookieInfo())
  useAppStore.setState({ config: fullConfig(), binaries, appUpdate: null })
})
afterEach(() => cleanup())

describe('SettingsScreen', () => {
  it('returns null without a config', () => {
    useAppStore.setState({ config: null })
    const { container } = render(<SettingsScreen />)
    expect(container.firstChild).toBeNull()
  })

  it('renders all sections', async () => {
    render(<SettingsScreen />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Downloads')).toBeInTheDocument()
    expect(screen.getByText('Cookies')).toBeInTheDocument()
    expect(screen.getByText('About')).toBeInTheDocument()
    await waitFor(() => expect(api.cookies.info).toHaveBeenCalled())
  })

  it('loads and shows the app version', async () => {
    api.system.appVersion.mockResolvedValue('9.9.9')
    render(<SettingsScreen />)
    expect(await screen.findByText('v9.9.9')).toBeInTheDocument()
  })

  it('chooses a download folder', async () => {
    api.system.chooseDir.mockResolvedValue('/new/dir')
    render(<SettingsScreen />)
    fireEvent.click(screen.getByText('Browse'))
    await waitFor(() =>
      expect(api.config.set).toHaveBeenCalledWith({ downloadDir: '/new/dir' })
    )
  })

  it('does not persist when the folder picker is cancelled', async () => {
    api.system.chooseDir.mockResolvedValue(null)
    render(<SettingsScreen />)
    fireEvent.click(screen.getByText('Browse'))
    await waitFor(() => expect(api.system.chooseDir).toHaveBeenCalled())
    expect(api.config.set).not.toHaveBeenCalled()
  })

  it('updates the output template', async () => {
    render(<SettingsScreen />)
    const input = screen.getByDisplayValue('%(title)s.%(ext)s')
    fireEvent.change(input, { target: { value: '%(id)s.%(ext)s' } })
    await waitFor(() =>
      expect(api.config.set).toHaveBeenCalledWith({ outputTemplate: '%(id)s.%(ext)s' })
    )
  })

  it('toggles a post-processing switch', async () => {
    render(<SettingsScreen />)
    fireEvent.click(screen.getByText('Embed thumbnail'))
    await waitFor(() =>
      expect(api.config.set).toHaveBeenCalledWith({ embedThumbnail: false })
    )
  })

  it('reveals subtitle languages when subtitles are enabled', () => {
    useAppStore.setState({ config: fullConfig({ writeSubtitles: true }) })
    render(<SettingsScreen />)
    expect(screen.getByText('Subtitle languages (comma-separated)')).toBeInTheDocument()
  })

  it('changes the theme', async () => {
    render(<SettingsScreen />)
    fireEvent.click(screen.getByText('light'))
    await waitFor(() => expect(api.config.set).toHaveBeenCalledWith({ theme: 'light' }))
  })

  it('updates a binary and refreshes status', async () => {
    render(<SettingsScreen />)
    const updateButtons = screen.getAllByText('Update')
    fireEvent.click(updateButtons[0])
    await waitFor(() => expect(api.binaries.update).toHaveBeenCalledWith('yt-dlp'))
    await waitFor(() => expect(api.binaries.status).toHaveBeenCalled())
  })

  it('resets to defaults', async () => {
    render(<SettingsScreen />)
    fireEvent.click(screen.getByText('Reset to defaults'))
    await waitFor(() => expect(api.config.reset).toHaveBeenCalled())
  })

  it('warns when no browsers are detected', async () => {
    api.cookies.info.mockResolvedValue(cookieInfo({ detected: [] }))
    render(<SettingsScreen />)
    expect(
      await screen.findByText(/No supported browsers detected/)
    ).toBeInTheDocument()
  })

  it('shows cookie controls when a browser is configured', async () => {
    api.cookies.info.mockResolvedValue(cookieInfo({ cached: true, effectiveLabel: 'Chrome', ageMs: 1000 }))
    useAppStore.setState({ config: fullConfig({ cookiesFromBrowser: 'chrome' }) })
    render(<SettingsScreen />)
    expect(await screen.findByText('Refresh')).toBeInTheDocument()
    expect(screen.getByText('Clear')).toBeInTheDocument()
  })

  it('refreshes cookies', async () => {
    api.cookies.info.mockResolvedValue(cookieInfo({ cached: true }))
    api.cookies.refresh.mockResolvedValue(cookieInfo({ cached: true }))
    useAppStore.setState({ config: fullConfig({ cookiesFromBrowser: 'chrome' }) })
    render(<SettingsScreen />)
    fireEvent.click(await screen.findByText('Refresh'))
    await waitFor(() => expect(api.cookies.refresh).toHaveBeenCalled())
  })

  it('clears cookies', async () => {
    api.cookies.info.mockResolvedValue(cookieInfo({ cached: true }))
    api.cookies.clear.mockResolvedValue(cookieInfo())
    useAppStore.setState({ config: fullConfig({ cookiesFromBrowser: 'chrome' }) })
    render(<SettingsScreen />)
    fireEvent.click(await screen.findByText('Clear'))
    await waitFor(() => expect(api.cookies.clear).toHaveBeenCalled())
  })

  it('checks for an app update', async () => {
    render(<SettingsScreen />)
    fireEvent.click(screen.getByText('Check for updates'))
    await waitFor(() => expect(api.appUpdate.check).toHaveBeenCalled())
  })

  it('offers a download button when an update is available', async () => {
    useAppStore.setState({
      appUpdate: { state: 'available', version: '2.0.0' } as AppUpdateStatus
    })
    render(<SettingsScreen />)
    fireEvent.click(screen.getByText('Download'))
    await waitFor(() => expect(api.appUpdate.download).toHaveBeenCalled())
  })

  it('offers an install button when an update is downloaded', async () => {
    useAppStore.setState({
      appUpdate: { state: 'downloaded', version: '2.0.0' } as AppUpdateStatus
    })
    render(<SettingsScreen />)
    fireEvent.click(screen.getByText('Restart & install'))
    await waitFor(() => expect(api.appUpdate.install).toHaveBeenCalled())
  })

  it('opens external links from the about panel', async () => {
    render(<SettingsScreen />)
    fireEvent.click(screen.getByText('GitHub repository'))
    await waitFor(() => expect(api.system.openExternal).toHaveBeenCalled())
  })
})

describe('SettingsScreen - extended controls', () => {
  it('edits subtitle languages', async () => {
    useAppStore.setState({ config: fullConfig({ writeSubtitles: true, subtitleLangs: ['en'] }) })
    render(<SettingsScreen />)
    const input = screen.getByPlaceholderText('en, es, fr')
    fireEvent.change(input, { target: { value: 'en, es, ' } })
    await waitFor(() =>
      expect(api.config.set).toHaveBeenCalledWith({ subtitleLangs: ['en', 'es'] })
    )
  })

  it('edits the playlist fetch limit and floors the value', async () => {
    render(<SettingsScreen />)
    const input = screen.getByDisplayValue('200')
    fireEvent.change(input, { target: { value: '350.7' } })
    await waitFor(() =>
      expect(api.config.set).toHaveBeenCalledWith({ playlistFetchLimit: 350 })
    )
  })

  it('moves the concurrency slider', async () => {
    render(<SettingsScreen />)
    const slider = screen.getByDisplayValue('2')
    fireEvent.change(slider, { target: { value: '6' } })
    await waitFor(() =>
      expect(api.config.set).toHaveBeenCalledWith({ maxConcurrentDownloads: 6 })
    )
  })

  it('switches the default container', async () => {
    render(<SettingsScreen />)
    fireEvent.click(screen.getByText('mkv'))
    await waitFor(() => expect(api.config.set).toHaveBeenCalledWith({ videoContainer: 'mkv' }))
  })

  it('toggles sponsor block and archive', async () => {
    render(<SettingsScreen />)
    fireEvent.click(screen.getByText('Remove sponsored segments (SponsorBlock)'))
    fireEvent.click(screen.getByText('Skip already-downloaded (archive)'))
    await waitFor(() => {
      expect(api.config.set).toHaveBeenCalledWith({ sponsorBlock: true })
      expect(api.config.set).toHaveBeenCalledWith({ useDownloadArchive: true })
    })
  })

  it('shows a cached-ready cookie status with age', async () => {
    api.cookies.info.mockResolvedValue(
      cookieInfo({ cached: true, effectiveBrowser: 'chrome', effectiveLabel: 'Chrome', ageMs: 5 * 60_000 })
    )
    useAppStore.setState({ config: fullConfig({ cookiesFromBrowser: 'chrome' }) })
    render(<SettingsScreen />)
    expect(await screen.findByText(/Cookies ready/)).toBeInTheDocument()
    expect(screen.getByText(/Using Chrome/)).toBeInTheDocument()
  })

  it('shows a stale cookie status', async () => {
    api.cookies.info.mockResolvedValue(
      cookieInfo({
        cached: true,
        effectiveBrowser: 'chrome',
        effectiveLabel: 'Chrome',
        ageMs: 8 * 24 * 60 * 60 * 1000
      })
    )
    useAppStore.setState({ config: fullConfig({ cookiesFromBrowser: 'chrome' }) })
    render(<SettingsScreen />)
    expect(await screen.findByText(/refreshing soon/)).toBeInTheDocument()
  })

  it('flags a failed cookie import when a browser resolves but nothing caches', async () => {
    api.cookies.info.mockResolvedValue(
      cookieInfo({ cached: false, effectiveBrowser: 'chrome', effectiveLabel: 'Chrome' })
    )
    useAppStore.setState({ config: fullConfig({ cookiesFromBrowser: 'chrome' }) })
    render(<SettingsScreen />)
    expect(await screen.findByText('No cookies imported yet')).toBeInTheDocument()
  })

  it('renders an up-to-date app update state', () => {
    useAppStore.setState({ appUpdate: { state: 'up-to-date' } as AppUpdateStatus })
    render(<SettingsScreen />)
    expect(screen.getByText('You are on the latest version')).toBeInTheDocument()
  })

  it('renders a downloading app update state with percent', () => {
    useAppStore.setState({
      appUpdate: { state: 'downloading', percent: 42 } as AppUpdateStatus
    })
    render(<SettingsScreen />)
    expect(screen.getByText(/Downloading… 42%/)).toBeInTheDocument()
  })

  it('renders an app update error state', () => {
    useAppStore.setState({
      appUpdate: { state: 'error', error: 'boom' } as AppUpdateStatus
    })
    render(<SettingsScreen />)
    expect(screen.getByText('boom')).toBeInTheDocument()
  })
})