import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  formatDuration,
  looksLikeAuthError,
  looksLikeUrl
} from '@renderer/lib/format'

describe('formatBytes', () => {
  it('handles empty values', () => {
    expect(formatBytes(null)).toBe('—')
    expect(formatBytes(0)).toBe('—')
  })
  it('formats across units', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB')
  })
})

describe('formatDuration', () => {
  it('handles empty values', () => {
    expect(formatDuration(null)).toBe('—')
  })
  it('formats minutes and seconds', () => {
    expect(formatDuration(75)).toBe('1:15')
  })
  it('formats hours', () => {
    expect(formatDuration(3661)).toBe('1:01:01')
  })
})

describe('looksLikeUrl', () => {
  it('recognizes http(s) URLs', () => {
    expect(looksLikeUrl('https://youtube.com/watch?v=abc')).toBe(true)
    expect(looksLikeUrl('http://example.com')).toBe(true)
  })
  it('recognizes bare domains', () => {
    expect(looksLikeUrl('youtube.com/watch?v=abc')).toBe(true)
    expect(looksLikeUrl('youtu.be/abc')).toBe(true)
  })
  it('treats plain text as a search query', () => {
    expect(looksLikeUrl('lofi hip hop')).toBe(false)
    expect(looksLikeUrl('rickroll')).toBe(false)
    expect(looksLikeUrl('')).toBe(false)
  })
})

describe('looksLikeAuthError', () => {
  it('matches auth-gated content errors', () => {
    expect(looksLikeAuthError('Sign in to confirm your age')).toBe(true)
    expect(looksLikeAuthError('This video is age-restricted')).toBe(true)
    expect(looksLikeAuthError('ERROR: Private video')).toBe(true)
    expect(looksLikeAuthError('Join this channel to get access')).toBe(true)
    expect(looksLikeAuthError('members-only content')).toBe(true)
    expect(looksLikeAuthError('This content requires payment')).toBe(true)
    expect(looksLikeAuthError("Sign in to confirm you're not a bot")).toBe(true)
    expect(looksLikeAuthError('Login required to view this')).toBe(true)
  })
  it('does not match ordinary errors', () => {
    expect(looksLikeAuthError('Video unavailable')).toBe(false)
    expect(looksLikeAuthError('Requested format is not available')).toBe(false)
    expect(looksLikeAuthError('HTTP Error 404: Not Found')).toBe(false)
  })
})
