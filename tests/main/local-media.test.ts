import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  net: { fetch: vi.fn() },
  protocol: { handle: vi.fn(), registerSchemesAsPrivileged: vi.fn() }
}))
vi.mock('@main/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

import { isAudioFile, localMediaUrl, parseRangeHeader } from '@main/local-media'

describe('parseRangeHeader', () => {
  it('parses a bounded range', () => {
    expect(parseRangeHeader('bytes=0-499', 1000)).toEqual({ start: 0, end: 499 })
  })

  it('parses an open-ended range to the end of the file', () => {
    expect(parseRangeHeader('bytes=500-', 1000)).toEqual({ start: 500, end: 999 })
  })

  it('parses a suffix range (final N bytes)', () => {
    expect(parseRangeHeader('bytes=-200', 1000)).toEqual({ start: 800, end: 999 })
  })

  it('clamps an end past the file size', () => {
    expect(parseRangeHeader('bytes=0-99999', 1000)).toEqual({ start: 0, end: 999 })
  })

  it('rejects unsatisfiable and malformed ranges', () => {
    expect(parseRangeHeader('bytes=1000-', 1000)).toBeNull()
    expect(parseRangeHeader('bytes=-', 1000)).toBeNull()
    expect(parseRangeHeader('bytes=abc-def', 1000)).toBeNull()
    expect(parseRangeHeader('items=0-10', 1000)).toBeNull()
    expect(parseRangeHeader(null, 1000)).toBeNull()
  })
})

describe('isAudioFile', () => {
  it('accepts common audio extensions case-insensitively', () => {
    expect(isAudioFile('C:\\music\\song.MP3')).toBe(true)
    expect(isAudioFile('/home/u/track.flac')).toBe(true)
  })

  it('rejects non-audio files', () => {
    expect(isAudioFile('C:\\clip.mp4')).toBe(false)
    expect(isAudioFile('C:\\notes.txt')).toBe(false)
  })
})

describe('localMediaUrl', () => {
  it('URL-encodes the path into the scheme', () => {
    const url = localMediaUrl('C:\\My Music\\a song.mp3')
    expect(url.startsWith('local-media://audio/')).toBe(true)
    expect(decodeURIComponent(url.split('audio/')[1])).toBe('C:\\My Music\\a song.mp3')
  })
})
