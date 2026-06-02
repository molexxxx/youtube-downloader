import { describe, expect, it } from 'vitest'
import { cleanErrorMessage } from '@main/errors'

describe('cleanErrorMessage', () => {
  it('strips the ERROR: prefix from yt-dlp output', () => {
    expect(cleanErrorMessage(new Error('ERROR: Video unavailable'))).toBe(
      'Video unavailable'
    )
  })

  it('prefers the ERROR: line within multi-line stderr', () => {
    const err = new Error(
      'Command failed\n[youtube] abc: Downloading webpage\nERROR: Private video'
    )
    expect(cleanErrorMessage(err)).toBe('Private video')
  })

  it('strips a leading [extractor] tag', () => {
    expect(cleanErrorMessage('ERROR: [youtube] Sign in to confirm')).toBe(
      'Sign in to confirm'
    )
  })

  it('falls back to the first line when no ERROR line exists', () => {
    expect(cleanErrorMessage('connection reset\nmore noise')).toBe('connection reset')
  })

  it('handles non-error values', () => {
    expect(cleanErrorMessage(undefined)).toBe('undefined')
    expect(cleanErrorMessage('')).toBe('Something went wrong')
  })
})
