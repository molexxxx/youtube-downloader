import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, cleanup } from '@testing-library/react'
import { UpdateToast } from '@renderer/components/layout/UpdateToast'
import { useAppStore } from '@renderer/stores/appStore'
import type { AppUpdateStatus } from '@shared/types'
import { installMockApi } from './helpers/mockApi'

let api: ReturnType<typeof installMockApi>

const status = (partial: Partial<AppUpdateStatus>): AppUpdateStatus => ({
  state: 'idle',
  version: null,
  percent: null,
  error: null,
  ...partial
})

beforeEach(() => {
  api = installMockApi()
  useAppStore.setState({ appUpdate: null })
})
afterEach(() => cleanup())

describe('UpdateToast', () => {
  it('renders nothing for idle/checking/error states', () => {
    for (const state of ['idle', 'checking', 'up-to-date', 'error'] as const) {
      useAppStore.setState({ appUpdate: status({ state }) })
      const { container } = render(<UpdateToast />)
      expect(container).toBeEmptyDOMElement()
      cleanup()
    }
  })

  it('offers to download when an update is available', () => {
    useAppStore.setState({ appUpdate: status({ state: 'available', version: '9.9.9' }) })
    render(<UpdateToast />)
    expect(screen.getByText('Update available')).toBeInTheDocument()
    expect(screen.getByText('Version 9.9.9')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Download update'))
    expect(api.appUpdate.download).toHaveBeenCalled()
  })

  it('shows download progress', () => {
    useAppStore.setState({
      appUpdate: status({ state: 'downloading', version: '9.9.9', percent: 42 })
    })
    render(<UpdateToast />)
    expect(screen.getByText('Downloading update…')).toBeInTheDocument()
    expect(screen.getByText('42%')).toBeInTheDocument()
  })

  it('restarts to install once downloaded', () => {
    useAppStore.setState({
      appUpdate: status({ state: 'downloaded', version: '9.9.9', percent: 100 })
    })
    render(<UpdateToast />)
    fireEvent.click(screen.getByText('Restart & update'))
    expect(api.appUpdate.install).toHaveBeenCalled()
  })

  it('stays dismissed for the same phase but re-appears on the next one', () => {
    useAppStore.setState({ appUpdate: status({ state: 'available', version: '9.9.9' }) })
    render(<UpdateToast />)
    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(screen.queryByText('Update available')).not.toBeInTheDocument()

    act(() => {
      useAppStore.setState({
        appUpdate: status({ state: 'downloaded', version: '9.9.9', percent: 100 })
      })
    })
    expect(screen.getByText('Update ready to install')).toBeInTheDocument()
  })
})
