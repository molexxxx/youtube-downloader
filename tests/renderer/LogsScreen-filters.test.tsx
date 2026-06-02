import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { LogsScreen } from '@renderer/components/logs/LogsScreen'
import { useAppStore } from '@renderer/stores/appStore'
import type { LogEntry } from '@shared/types'

const sample: LogEntry[] = [
  { level: 'debug', message: 'debug line', timestamp: 1_000 },
  { level: 'info', message: 'info line', timestamp: 2_000 },
  { level: 'warn', message: 'warn line', timestamp: 3_000 },
  { level: 'error', message: 'error line', timestamp: 4_000 }
]

beforeEach(() => {
  useAppStore.getState().setLogs(sample)
})
afterEach(() => cleanup())

describe('LogsScreen filtering and actions', () => {
  it('renders every level by default', () => {
    render(<LogsScreen />)
    expect(screen.getByText('debug line')).toBeInTheDocument()
    expect(screen.getByText('error line')).toBeInTheDocument()
  })

  it('hides a level when its filter is toggled off', () => {
    render(<LogsScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'debug' }))
    expect(screen.queryByText('debug line')).not.toBeInTheDocument()
    expect(screen.getByText('info line')).toBeInTheDocument()
  })

  it('falls back to all levels when the last active filter is removed', () => {
    render(<LogsScreen />)
    for (const level of ['debug', 'info', 'warn', 'error']) {
      fireEvent.click(screen.getByRole('button', { name: level }))
    }
    // Removing the final active filter restores everything.
    expect(screen.getByText('debug line')).toBeInTheDocument()
    expect(screen.getByText('error line')).toBeInTheDocument()
  })

  it('toggles the tail/follow button', () => {
    render(<LogsScreen />)
    const tail = screen.getByTitle('Follow new logs')
    fireEvent.click(tail)
    fireEvent.click(tail)
    expect(tail).toBeInTheDocument()
  })

  it('copies visible logs to the clipboard', () => {
    const writeText = vi.fn()
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<LogsScreen />)
    fireEvent.click(screen.getByTitle('Copy visible logs'))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('INFO info line'))
  })

  it('clears the view', () => {
    render(<LogsScreen />)
    fireEvent.click(screen.getByTitle('Clear the view'))
    expect(useAppStore.getState().logs).toHaveLength(0)
  })
})
