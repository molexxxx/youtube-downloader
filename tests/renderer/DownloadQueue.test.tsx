import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { DownloadQueue } from '@renderer/components/download/DownloadQueue'
import { useAppStore } from '@renderer/stores/appStore'
import type { DownloadJob } from '@shared/types'
import { installMockApi } from './helpers/mockApi'

const job = (overrides: Partial<DownloadJob>): DownloadJob =>
  ({
    id: 'j1',
    url: 'https://x',
    title: 'Clip',
    kind: 'video',
    state: 'downloading',
    percent: 25,
    speed: '1MB/s',
    eta: '10s',
    outputPath: '/out.mp4',
    error: null,
    createdAt: 1,
    ...overrides
  }) as DownloadJob

let api: ReturnType<typeof installMockApi>

beforeEach(() => {
  api = installMockApi()
  useAppStore.getState().setJobs([])
})
afterEach(() => cleanup())

describe('DownloadQueue', () => {
  it('shows an empty state with no jobs', () => {
    render(<DownloadQueue />)
    expect(screen.getByText('No downloads yet')).toBeInTheDocument()
  })

  it('renders an active job with progress', () => {
    useAppStore.getState().setJobs([job({ title: 'My Clip', percent: 42 })])
    render(<DownloadQueue />)
    expect(screen.getByText('My Clip')).toBeInTheDocument()
    expect(screen.getByText('42%')).toBeInTheDocument()
  })

  it('cancels an active job', () => {
    useAppStore.getState().setJobs([job({ id: 'cancel-me' })])
    render(<DownloadQueue />)
    fireEvent.click(screen.getByLabelText('Cancel'))
    expect(api.download.cancel).toHaveBeenCalledWith('cancel-me')
  })

  it('reveals a completed job in the folder', () => {
    useAppStore.getState().setJobs([job({ state: 'completed', outputPath: '/done.mp4' })])
    render(<DownloadQueue />)
    fireEvent.click(screen.getByLabelText('Show in folder'))
    expect(api.system.showItem).toHaveBeenCalledWith('/done.mp4')
  })

  it('shows an error message for failed jobs', () => {
    useAppStore.getState().setJobs([job({ state: 'error', error: 'network down' })])
    render(<DownloadQueue />)
    expect(screen.getByText('network down')).toBeInTheDocument()
  })

  it('clears finished jobs', async () => {
    useAppStore
      .getState()
      .setJobs([
        job({ id: 'a', state: 'downloading' }),
        job({ id: 'b', state: 'completed' })
      ])
    render(<DownloadQueue />)
    fireEvent.click(screen.getByText('Clear finished'))
    await waitFor(() =>
      expect(useAppStore.getState().jobs.map((j) => j.id)).toEqual(['a'])
    )
  })
})
