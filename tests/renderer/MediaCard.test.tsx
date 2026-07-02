import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MediaCard } from '@renderer/components/download/MediaCard'
import { useAppStore } from '@renderer/stores/appStore'
import type { MediaInfo, PlaylistEntry, VideoFormat } from '@shared/types'
import { installMockApi } from './helpers/mockApi'

let api: ReturnType<typeof installMockApi>

const videoFormat = (id: string, resolution: string, height: number): VideoFormat =>
  ({
    formatId: id,
    ext: 'mp4',
    resolution,
    vcodec: 'avc1',
    acodec: 'none',
    fps: 30,
    tbr: height,
    filesize: 1024 * 1024
  }) as VideoFormat

const single = (overrides: Partial<MediaInfo> = {}): MediaInfo =>
  ({
    id: 'v1',
    title: 'Single Video',
    uploader: 'Channel',
    duration: 200,
    thumbnail: 'https://t/thumb.jpg',
    webpageUrl: 'https://youtube.com/watch?v=v1',
    isPlaylist: false,
    playlistCount: 0,
    formats: [videoFormat('137', '1920x1080', 1080), videoFormat('136', '1280x720', 720)],
    entries: [],
    ...overrides
  }) as MediaInfo

const entry = (id: string): PlaylistEntry =>
  ({
    id,
    title: `Item ${id}`,
    url: `https://y/${id}`,
    duration: 60,
    thumbnail: null
  }) as PlaylistEntry

const playlist = (count: number, overrides: Partial<MediaInfo> = {}): MediaInfo =>
  ({
    ...single(),
    id: 'PL1',
    title: 'My Playlist',
    isPlaylist: true,
    playlistCount: count,
    entries: Array.from({ length: count }, (_, i) => entry(String(i + 1))),
    ...overrides
  }) as MediaInfo

beforeEach(() => {
  api = installMockApi()
  useAppStore.setState({ info: null, config: { playlistFetchLimit: 200 } as never })
})
afterEach(() => cleanup())

describe('MediaCard', () => {
  it('renders nothing without resolved info', () => {
    const { container } = render(<MediaCard />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a single video card', () => {
    useAppStore.setState({ info: single({ title: 'Cool Video' }) })
    render(<MediaCard />)
    expect(screen.getByText('Cool Video')).toBeInTheDocument()
    expect(screen.getByText('Channel')).toBeInTheDocument()
  })

  it('closes the card', () => {
    useAppStore.setState({ info: single() })
    render(<MediaCard />)
    fireEvent.click(screen.getByTitle('Close'))
    expect(useAppStore.getState().info).toBeNull()
  })

  it('switches to audio mode and shows audio formats', () => {
    useAppStore.setState({ info: single() })
    render(<MediaCard />)
    fireEvent.click(screen.getByText('Audio'))
    expect(screen.getByText('mp3')).toBeInTheDocument()
    expect(screen.getByText('flac')).toBeInTheDocument()
  })

  it('applies an audio preset', () => {
    useAppStore.setState({ info: single() })
    render(<MediaCard />)
    fireEvent.click(screen.getByText('Audio MP3'))
    expect(screen.getByText('Bitrate')).toBeInTheDocument()
  })

  it('hides the bitrate selector for lossless formats', () => {
    useAppStore.setState({ info: single() })
    render(<MediaCard />)
    fireEvent.click(screen.getByText('Audio'))
    fireEvent.click(screen.getByText('flac'))
    expect(screen.queryByText('Bitrate')).not.toBeInTheDocument()
  })

  it('toggles the more-options panel', () => {
    useAppStore.setState({ info: single() })
    render(<MediaCard />)
    fireEvent.click(screen.getByText('More options'))
    expect(screen.getByText('Thumbnail')).toBeInTheDocument()
    expect(screen.getByText('SponsorBlock')).toBeInTheDocument()
  })

  it('starts a single video download with the chosen container', async () => {
    useAppStore.setState({ info: single() })
    render(<MediaCard />)
    fireEvent.click(screen.getByText('mkv'))
    fireEvent.click(screen.getByText('Download'))
    await waitFor(() => expect(api.download.start).toHaveBeenCalled())
    const req = api.download.start.mock.calls[0][0]
    expect(req).toMatchObject({
      url: 'https://youtube.com/watch?v=v1',
      kind: 'video',
      container: 'mkv',
      noPlaylist: true
    })
  })

  it('starts an audio download', async () => {
    useAppStore.setState({ info: single() })
    render(<MediaCard />)
    fireEvent.click(screen.getByText('Audio'))
    fireEvent.click(screen.getByText('Download'))
    await waitFor(() => expect(api.download.start).toHaveBeenCalled())
    expect(api.download.start.mock.calls[0][0]).toMatchObject({
      kind: 'audio',
      audioFormat: 'mp3',
      audioBitrate: 320
    })
  })

  it('renders a playlist with all items selected', () => {
    useAppStore.setState({ info: playlist(3) })
    render(<MediaCard />)
    expect(screen.getByText('3 of 3 selected')).toBeInTheDocument()
    expect(screen.getByText('Download 3 items')).toBeInTheDocument()
  })

  it('deselects and reselects all playlist items', () => {
    useAppStore.setState({ info: playlist(2) })
    render(<MediaCard />)
    fireEvent.click(screen.getByText('Deselect all'))
    expect(screen.getByText('0 of 2 selected')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Select all'))
    expect(screen.getByText('2 of 2 selected')).toBeInTheDocument()
  })

  it('toggles an individual playlist item', () => {
    useAppStore.setState({ info: playlist(3) })
    render(<MediaCard />)
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    expect(screen.getByText('2 of 3 selected')).toBeInTheDocument()
  })

  it('enqueues each selected playlist item as a separate job', async () => {
    useAppStore.setState({ info: playlist(3) })
    render(<MediaCard />)
    // Deselect item 2; items 1 and 3 remain selected.
    fireEvent.click(screen.getAllByRole('checkbox')[1])
    fireEvent.click(screen.getByText('Download 2 items'))
    await waitFor(() => expect(api.download.start).toHaveBeenCalledTimes(2))
    expect(api.download.start.mock.calls[0][0]).toMatchObject({
      url: 'https://y/1',
      noPlaylist: true
    })
    expect(api.download.start.mock.calls[1][0]).toMatchObject({
      url: 'https://y/3',
      noPlaylist: true
    })
  })

  it('disables download when nothing is selected', () => {
    useAppStore.setState({ info: playlist(2) })
    render(<MediaCard />)
    fireEvent.click(screen.getByText('Deselect all'))
    expect(screen.getByText('Download 0 items').closest('button')).toBeDisabled()
  })

  it('loads more items for a paged playlist', async () => {
    const big = playlist(200, { playlistCount: 400 })
    api.extract.playlistPage.mockResolvedValue([entry('201'), entry('202')])
    useAppStore.setState({ info: big })
    render(<MediaCard />)
    const loadMore = screen.getByText(/Load \d+ more/)
    fireEvent.click(loadMore)
    await waitFor(() => expect(api.extract.playlistPage).toHaveBeenCalled())
    const [url, start, end] = api.extract.playlistPage.mock.calls[0]
    expect(url).toBe('https://youtube.com/watch?v=v1')
    expect(start).toBe(201)
    expect(end).toBe(400)
  })

  it('surfaces an error when loading more fails', async () => {
    const big = playlist(200, { playlistCount: 400 })
    api.extract.playlistPage.mockRejectedValue(new Error('page boom'))
    useAppStore.setState({ info: big })
    render(<MediaCard />)
    fireEvent.click(screen.getByText(/Load \d+ more/))
    await waitFor(() => expect(useAppStore.getState().error).toBe('page boom'))
  })

  it('applies a capped-height video preset and downloads the matched format', async () => {
    useAppStore.setState({ info: single() })
    render(<MediaCard />)
    fireEvent.click(screen.getByText('720p MP4'))
    fireEvent.click(screen.getByText('Download'))
    await waitFor(() => expect(api.download.start).toHaveBeenCalled())
    expect(api.download.start.mock.calls[0][0]).toMatchObject({
      kind: 'video',
      container: 'mp4',
      formatId: '136'
    })
  })

  it('toggles embed options in the more-options panel', async () => {
    useAppStore.setState({ info: single() })
    render(<MediaCard />)
    fireEvent.click(screen.getByText('More options'))
    fireEvent.click(screen.getByText('Thumbnail'))
    fireEvent.click(screen.getByText('Subtitles'))
    fireEvent.click(screen.getByText('SponsorBlock'))
    fireEvent.click(screen.getByText('Download'))
    await waitFor(() => expect(api.download.start).toHaveBeenCalled())
    expect(api.download.start.mock.calls[0][0]).toMatchObject({
      embedThumbnail: false,
      writeSubtitles: true,
      sponsorBlock: true
    })
  })

  it('stops offering load-more once a short page returns', async () => {
    const big = playlist(200, { playlistCount: 400 })
    api.extract.playlistPage.mockResolvedValue([entry('201')])
    useAppStore.setState({ info: big })
    render(<MediaCard />)
    fireEvent.click(screen.getByText(/Load \d+ more/))
    await waitFor(() => expect(api.extract.playlistPage).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.queryByText(/Load \d+ more/)).not.toBeInTheDocument()
    )
  })
})
