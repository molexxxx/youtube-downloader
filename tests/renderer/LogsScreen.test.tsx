import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LogsScreen } from '@renderer/components/logs/LogsScreen'
import { useAppStore } from '@renderer/stores/appStore'
import type { LogEntry } from '@shared/types'

const sample: LogEntry[] = [
  { level: 'info', message: 'started up', timestamp: 1_000 },
  { level: 'error', message: 'boom happened', timestamp: 2_000 }
]

describe('LogsScreen', () => {
  beforeEach(() => {
    useAppStore.getState().setLogs(sample)
  })

  it('renders log messages', () => {
    render(<LogsScreen />)
    expect(screen.getByText('started up')).toBeInTheDocument()
    expect(screen.getByText('boom happened')).toBeInTheDocument()
  })

  it('shows an empty state when there are no logs', () => {
    useAppStore.getState().setLogs([])
    render(<LogsScreen />)
    expect(screen.getByText('No log entries.')).toBeInTheDocument()
  })

  it('clears the view', () => {
    render(<LogsScreen />)
    fireEvent.click(screen.getByTitle('Clear the view'))
    expect(useAppStore.getState().logs).toHaveLength(0)
  })
})
