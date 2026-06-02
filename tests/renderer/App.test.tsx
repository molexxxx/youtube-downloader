import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import App from '@renderer/App'
import { useAppStore } from '@renderer/stores/appStore'
import type { BinariesStatus } from '@shared/types'
import { installMockApi } from './helpers/mockApi'

let api: ReturnType<typeof installMockApi>

const notReady: BinariesStatus = {
  ytdlp: { name: 'yt-dlp', installed: false, path: null, version: null },
  ffmpeg: { name: 'ffmpeg', installed: false, path: null, version: null }
}

beforeEach(() => {
  api = installMockApi()
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {}
  }))
  useAppStore.setState({
    config: null,
    binaries: null,
    binariesReady: false,
    view: 'downloads',
    info: null,
    error: null,
    resolving: false,
    searchResults: [],
    jobs: [],
    cookieHint: false
  })
})
afterEach(() => cleanup())

describe('App', () => {
  it('bootstraps state from the api on mount', async () => {
    render(<App />)
    await waitFor(() => expect(api.config.get).toHaveBeenCalled())
    expect(api.binaries.status).toHaveBeenCalled()
    expect(api.download.list).toHaveBeenCalled()
    expect(api.history.list).toHaveBeenCalled()
    expect(api.logs.list).toHaveBeenCalled()
  })

  it('subscribes to live events and cleans them up on unmount', () => {
    const { unmount } = render(<App />)
    expect(api.download.onUpdate).toHaveBeenCalled()
    expect(api.history.onChange).toHaveBeenCalled()
    expect(api.logs.onEntry).toHaveBeenCalled()
    expect(api.appUpdate.onStatus).toHaveBeenCalled()
    expect(() => unmount()).not.toThrow()
  })

  it('shows the setup gate when binaries are present but not ready', async () => {
    api.binaries.status.mockResolvedValue(notReady)
    api.binaries.bootstrap.mockResolvedValue(notReady)
    render(<App />)
    expect(await screen.findByText('Setting things up')).toBeInTheDocument()
  })

  it('renders the downloads view with an empty state when ready', async () => {
    render(<App />)
    await waitFor(() => expect(useAppStore.getState().binariesReady).toBe(true))
    expect(screen.getByText('Ready when you are')).toBeInTheDocument()
  })

  it('shows an error banner', async () => {
    render(<App />)
    await waitFor(() => expect(useAppStore.getState().binariesReady).toBe(true))
    useAppStore.getState().setError('something failed')
    expect(await screen.findByText('something failed')).toBeInTheDocument()
  })

  it('renders the cookie hint and navigates to settings', async () => {
    render(<App />)
    await waitFor(() => expect(useAppStore.getState().binariesReady).toBe(true))
    useAppStore.getState().setCookieHint(true)
    const button = await screen.findByText('Set up cookies')
    fireEvent.click(button)
    expect(useAppStore.getState().view).toBe('settings')
    expect(useAppStore.getState().cookieHint).toBe(false)
  })

  it('dismisses the cookie hint', async () => {
    render(<App />)
    await waitFor(() => expect(useAppStore.getState().binariesReady).toBe(true))
    useAppStore.getState().setCookieHint(true)
    fireEvent.click(await screen.findByLabelText('Dismiss'))
    expect(useAppStore.getState().cookieHint).toBe(false)
  })

  it('renders the history view', async () => {
    render(<App />)
    await waitFor(() => expect(useAppStore.getState().binariesReady).toBe(true))
    useAppStore.getState().setView('history')
    expect(await screen.findByText('Download history')).toBeInTheDocument()
  })

  it('renders the logs view', async () => {
    render(<App />)
    await waitFor(() => expect(useAppStore.getState().binariesReady).toBe(true))
    useAppStore.getState().setView('logs')
    await waitFor(() => expect(useAppStore.getState().view).toBe('logs'))
  })
})
