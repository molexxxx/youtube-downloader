import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { TitleBar } from '@renderer/components/layout/TitleBar'
import { useAppStore } from '@renderer/stores/appStore'
import type { AppUpdateStatus, DiscordStatus } from '@shared/types'
import { installMockApi } from './helpers/mockApi'

let api: ReturnType<typeof installMockApi>

beforeEach(() => {
  api = installMockApi()
  useAppStore.setState({ view: 'downloads', binariesReady: true, appUpdate: null })
})
afterEach(() => cleanup())

describe('TitleBar', () => {
  it('renders the two primary tabs and utility icons when binaries are ready', () => {
    render(<TitleBar />)
    expect(screen.getByText('Downloader')).toBeInTheDocument()
    expect(screen.getByText('Discord Bot')).toBeInTheDocument()
    expect(screen.getByLabelText('Logs')).toBeInTheDocument()
    expect(screen.getByLabelText('Settings')).toBeInTheDocument()
  })

  it('hides navigation until binaries are ready', () => {
    useAppStore.setState({ binariesReady: false })
    render(<TitleBar />)
    expect(screen.queryByText('Downloader')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Settings')).not.toBeInTheDocument()
  })

  it('switches views when tabs and icons are clicked', () => {
    render(<TitleBar />)
    fireEvent.click(screen.getByText('Discord Bot'))
    expect(useAppStore.getState().view).toBe('discord')
    fireEvent.click(screen.getByText('Downloader'))
    expect(useAppStore.getState().view).toBe('downloads')
    fireEvent.click(screen.getByLabelText('Logs'))
    expect(useAppStore.getState().view).toBe('logs')
    fireEvent.click(screen.getByLabelText('Settings'))
    expect(useAppStore.getState().view).toBe('settings')
  })

  it('keeps the Downloader tab active while in history', () => {
    useAppStore.setState({ view: 'history' })
    render(<TitleBar />)
    const downloader = screen.getByText('Downloader').closest('button')
    expect(downloader?.className).toContain('bg-red-500/15')
  })

  it('shows an update badge when an update is ready', () => {
    useAppStore.setState({ appUpdate: { state: 'available' } as AppUpdateStatus })
    render(<TitleBar />)
    expect(screen.getByLabelText('Update available')).toBeInTheDocument()
  })

  it('shows a connected dot on the Discord tab when the bot is ready', () => {
    useAppStore.setState({ discordStatus: { state: 'ready' } as DiscordStatus })
    render(<TitleBar />)
    expect(screen.getByLabelText('Bot connected')).toBeInTheDocument()
  })

  it('wires the window controls', () => {
    render(<TitleBar />)
    fireEvent.click(screen.getByLabelText('Minimize'))
    fireEvent.click(screen.getByLabelText('Maximize'))
    fireEvent.click(screen.getByLabelText('Close'))
    expect(api.system.minimize).toHaveBeenCalled()
    expect(api.system.maximize).toHaveBeenCalled()
    expect(api.system.close).toHaveBeenCalled()
  })
})
