import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { EmptyState, ResolveSkeleton } from '@renderer/components/download/EmptyState'

afterEach(() => cleanup())

describe('EmptyState', () => {
  it('renders the heading and all hint cards', () => {
    render(<EmptyState />)
    expect(screen.getByText('Ready when you are')).toBeInTheDocument()
    expect(screen.getByText('Paste a video link')).toBeInTheDocument()
    expect(screen.getByText('Drop a playlist URL')).toBeInTheDocument()
    expect(screen.getByText('Search by keywords')).toBeInTheDocument()
    expect(screen.getByText('Grab audio only')).toBeInTheDocument()
  })
})

describe('ResolveSkeleton', () => {
  it('renders without crashing', () => {
    const { container } = render(<ResolveSkeleton />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })
})
