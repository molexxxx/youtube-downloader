import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { HistoryScreen } from '@renderer/components/history/HistoryScreen'
import { useAppStore } from '@renderer/stores/appStore'
import type { HistoryEntry } from '@shared/types'
import { installMockApi } from './helpers/mockApi'

const entry = (overrides: Partial<HistoryEntry>): HistoryEntry =>
  ({
    id: 'h1',
    url: 'https://x',
    title: 'Past Clip',
    kind: 'video',
    status: 'completed',
    outputPath: '/out.mp4',
    error: null,
    completedAt: Date.now(),
    ...overrides
  }) as HistoryEntry

let api: ReturnType<typeof installMockApi>

beforeEach(() => {
  api = installMockApi()
  useAppStore.getState().setHistory([])
})
afterEach(() => cleanup())

describe('HistoryScreen', () => {
  it('shows an empty state when there is no history', () => {
    render(<HistoryScreen />)
    expect(screen.getByText(/No downloads yet/)).toBeInTheDocument()
  })

  it('renders history rows', () => {
    useAppStore.getState().setHistory([entry({ title: 'Watched Video' })])
    render(<HistoryScreen />)
    expect(screen.getByText('Watched Video')).toBeInTheDocument()
  })

  it('shows the error for a failed entry', () => {
    useAppStore.getState().setHistory([
      entry({ status: 'error', error: 'failed to fetch', outputPath: null })
    ])
    render(<HistoryScreen />)
    expect(screen.getByText(/failed to fetch/)).toBeInTheDocument()
  })

  it('reveals a completed entry', () => {
    useAppStore.getState().setHistory([entry({ outputPath: '/done.mp4' })])
    render(<HistoryScreen />)
    fireEvent.click(screen.getByLabelText('Show in folder'))
    expect(api.system.showItem).toHaveBeenCalledWith('/done.mp4')
  })

  it('removes an entry', async () => {
    api.history.remove.mockResolvedValue([])
    useAppStore.getState().setHistory([entry({ id: 'rm' })])
    render(<HistoryScreen />)
    fireEvent.click(screen.getByLabelText('Remove from history'))
    await waitFor(() => expect(api.history.remove).toHaveBeenCalledWith('rm'))
  })

  it('clears all history', async () => {
    api.history.clear.mockResolvedValue([])
    useAppStore.getState().setHistory([entry({})])
    render(<HistoryScreen />)
    fireEvent.click(screen.getByText('Clear all'))
    await waitFor(() => expect(api.history.clear).toHaveBeenCalled())
  })

  it('formats relative timestamps across thresholds', () => {
    const now = Date.now()
    useAppStore.getState().setHistory([
      entry({ id: 'a', title: 'now', completedAt: now }),
      entry({ id: 'b', title: 'mins', completedAt: now - 5 * 60_000 }),
      entry({ id: 'c', title: 'hours', completedAt: now - 3 * 3_600_000 }),
      entry({ id: 'd', title: 'days', completedAt: now - 3 * 86_400_000 })
    ])
    render(<HistoryScreen />)
    expect(screen.getByText('just now')).toBeInTheDocument()
    expect(screen.getByText('5m ago')).toBeInTheDocument()
    expect(screen.getByText('3h ago')).toBeInTheDocument()
    expect(
      screen.getByText(new Date(now - 3 * 86_400_000).toLocaleDateString())
    ).toBeInTheDocument()
  })
})
