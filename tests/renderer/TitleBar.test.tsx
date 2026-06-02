import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { TitleBar } from '@renderer/components/layout/TitleBar'
import { useAppStore } from '@renderer/stores/appStore'
import type { AppUpdateStatus } from '@shared/types'
import { installMockApi } from './helpers/mockApi'

let api: ReturnType<typeof installMockApi>

beforeEach(() => {
  api = installMockApi()
  useAppStore.setState({ view: 'downloads', binariesReady: true, appUpdate: null })
})
afterEach(() => cleanup())

describe('TitleBar', () => {
  it('renders navigation when binaries are ready', () => {
    render(<TitleBar />)
    expect(screen.getByText('Downloads')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('hides navigation until binaries are ready', () => {
    useAppStore.setState({ binariesReady: false })
    render(<TitleBar />)
    expect(screen.queryByText('Downloads')).not.toBeInTheDocument()
  })

  it('switches views when a tab is clicked', () => {
    render(<TitleBar />)
    fireEvent.click(screen.getByText('History'))
    expect(useAppStore.getState().view).toBe('history')
    fireEvent.click(screen.getByText('Logs'))
    expect(useAppStore.getState().view).toBe('logs')
  })

  it('shows an update badge when an update is ready', () => {
    useAppStore.setState({ appUpdate: { state: 'available' } as AppUpdateStatus })
    render(<TitleBar />)
    expect(screen.getByLabelText('Update available')).toBeInTheDocument()
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
