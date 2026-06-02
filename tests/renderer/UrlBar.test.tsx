import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { UrlBar } from '@renderer/components/download/UrlBar'
import { useAppStore } from '@renderer/stores/appStore'
import type { MediaInfo, PlaylistEntry } from '@shared/types'
import { installMockApi } from './helpers/mockApi'

let api: ReturnType<typeof installMockApi>

const info = (overrides: Partial<MediaInfo> = {}): MediaInfo =>
  ({ id: 'v', title: 'Video', entries: [], formats: [], ...overrides }) as MediaInfo

const result = (id: string): PlaylistEntry =>
  ({ id, title: `Result ${id}`, url: `https://y/${id}`, duration: 90, thumbnail: null }) as PlaylistEntry

beforeEach(() => {
  api = installMockApi()
  useAppStore.setState({
    resolving: false,
    info: null,
    searchResults: [],
    error: null,
    cookieHint: false,
    config: { cookiesFromBrowser: null } as never
  })
})
afterEach(() => cleanup())

function type(value: string): void {
  fireEvent.change(screen.getByPlaceholderText(/Paste a URL/), { target: { value } })
}

describe('UrlBar', () => {
  it('resolves a plain video URL', async () => {
    api.extract.info.mockResolvedValue(info({ title: 'Resolved' }))
    render(<UrlBar />)
    type('https://youtube.com/watch?v=abc')
    fireEvent.click(screen.getByText('Resolve'))
    await waitFor(() => expect(api.extract.info).toHaveBeenCalledWith(
      'https://youtube.com/watch?v=abc',
      false
    ))
    await waitFor(() => expect(useAppStore.getState().info?.title).toBe('Resolved'))
  })

  it('searches when the input is not a URL', async () => {
    api.extract.search.mockResolvedValue([result('a'), result('b')])
    render(<UrlBar />)
    type('lofi beats')
    expect(screen.getByText('Search')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Search'))
    await waitFor(() => expect(api.extract.search).toHaveBeenCalledWith('lofi beats'))
    await waitFor(() => expect(screen.getByText('2 search results')).toBeInTheDocument())
  })

  it('submits on Enter', async () => {
    api.extract.info.mockResolvedValue(info())
    render(<UrlBar />)
    const input = screen.getByPlaceholderText(/Paste a URL/)
    fireEvent.change(input, { target: { value: 'https://youtube.com/watch?v=xyz' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(api.extract.info).toHaveBeenCalled())
  })

  it('prompts for a playlist choice on an ambiguous link', () => {
    render(<UrlBar />)
    type('https://youtube.com/watch?v=abc&list=PL123')
    fireEvent.click(screen.getByText('Resolve'))
    expect(screen.getByText('This link is part of a playlist')).toBeInTheDocument()
  })

  it('resolves just the video from the playlist prompt', async () => {
    api.extract.info.mockResolvedValue(info())
    render(<UrlBar />)
    type('https://youtube.com/watch?v=abc&list=PL123')
    fireEvent.click(screen.getByText('Resolve'))
    fireEvent.click(screen.getByText('Just this video'))
    await waitFor(() =>
      expect(api.extract.info).toHaveBeenCalledWith(
        'https://youtube.com/watch?v=abc&list=PL123',
        false
      )
    )
  })

  it('resolves the entire playlist from the prompt', async () => {
    api.extract.info.mockResolvedValue(info())
    render(<UrlBar />)
    type('https://youtube.com/watch?v=abc&list=PL123')
    fireEvent.click(screen.getByText('Resolve'))
    fireEvent.click(screen.getByText('Entire playlist'))
    await waitFor(() =>
      expect(api.extract.info).toHaveBeenCalledWith(
        'https://youtube.com/watch?v=abc&list=PL123',
        true
      )
    )
  })

  it('clears the input', () => {
    render(<UrlBar />)
    type('something')
    fireEvent.click(screen.getByTitle('Clear'))
    expect((screen.getByPlaceholderText(/Paste a URL/) as HTMLInputElement).value).toBe('')
  })

  it('surfaces resolve errors and the cookie hint on auth failures', async () => {
    api.extract.info.mockRejectedValue(new Error('Sign in to confirm you are not a bot'))
    render(<UrlBar />)
    type('https://youtube.com/watch?v=abc')
    fireEvent.click(screen.getByText('Resolve'))
    await waitFor(() => expect(useAppStore.getState().error).toMatch(/Sign in/))
    expect(useAppStore.getState().cookieHint).toBe(true)
  })

  it('resolves a search result when clicked', async () => {
    api.extract.search.mockResolvedValue([result('a')])
    api.extract.info.mockResolvedValue(info())
    render(<UrlBar />)
    type('query')
    fireEvent.click(screen.getByText('Search'))
    await screen.findByText('Result a')
    fireEvent.click(screen.getByText('Result a'))
    await waitFor(() => expect(api.extract.info).toHaveBeenCalledWith('https://y/a', false))
  })
})
