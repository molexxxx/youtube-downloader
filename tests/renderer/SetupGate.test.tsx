import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { SetupGate } from '@renderer/components/setup/SetupGate'
import { useAppStore } from '@renderer/stores/appStore'
import type { BinariesStatus, BootstrapProgress } from '@shared/types'
import { installMockApi } from './helpers/mockApi'

const ready: BinariesStatus = {
  ytdlp: { name: 'yt-dlp', installed: true, path: '/yt', version: '1' },
  ffmpeg: { name: 'ffmpeg', installed: true, path: '/ff', version: '1' }
}

let api: ReturnType<typeof installMockApi>

beforeEach(() => {
  api = installMockApi()
  useAppStore.setState({ bootstrap: null, binaries: null, binariesReady: false })
})
afterEach(() => cleanup())

describe('SetupGate', () => {
  it('runs bootstrap automatically on mount and stores the result', async () => {
    api.binaries.bootstrap.mockResolvedValue(ready)
    render(<SetupGate />)
    await waitFor(() => expect(api.binaries.bootstrap).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(useAppStore.getState().binariesReady).toBe(true))
  })

  it('shows the bootstrap stage label', async () => {
    api.binaries.bootstrap.mockResolvedValue(ready)
    useAppStore.setState({
      bootstrap: { binary: 'ffmpeg', stage: 'downloading', percent: 50 } as BootstrapProgress
    })
    render(<SetupGate />)
    expect(screen.getByText(/ffmpeg: downloading 50%/)).toBeInTheDocument()
  })

  it('offers a retry button once bootstrap settles', async () => {
    api.binaries.bootstrap.mockResolvedValue(ready)
    render(<SetupGate />)
    const retry = await screen.findByText('Retry')
    fireEvent.click(retry)
    await waitFor(() => expect(api.binaries.bootstrap).toHaveBeenCalledTimes(2))
  })
})
