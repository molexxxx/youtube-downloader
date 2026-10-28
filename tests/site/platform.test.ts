import { describe, expect, it } from 'vitest'
import { detectPlatform } from '../../site/src/platform'

const WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15'
const LINUX_UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0'
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1'

describe('detectPlatform', () => {
  it('maps desktop browsers to their installer family', () => {
    expect(detectPlatform({ userAgent: WINDOWS_UA, platform: 'Win32' })).toBe('windows')
    expect(
      detectPlatform({ userAgent: MAC_UA, platform: 'MacIntel', maxTouchPoints: 0 })
    ).toBe('mac')
    expect(detectPlatform({ userAgent: LINUX_UA, platform: 'Linux x86_64' })).toBe(
      'linux'
    )
  })

  it('prefers User-Agent Client Hints when the browser sends them', () => {
    expect(detectPlatform({ userAgent: '', uaPlatform: 'macOS', mobile: false })).toBe(
      'mac'
    )
    expect(detectPlatform({ userAgent: '', uaPlatform: 'Windows', mobile: false })).toBe(
      'windows'
    )
  })

  it('treats phones and tablets as other, including iPadOS posing as a Mac', () => {
    expect(detectPlatform({ userAgent: ANDROID_UA, platform: 'Linux armv81' })).toBe(
      'other'
    )
    expect(detectPlatform({ userAgent: IPHONE_UA, platform: 'iPhone' })).toBe('other')
    expect(
      detectPlatform({ userAgent: MAC_UA, platform: 'MacIntel', maxTouchPoints: 5 })
    ).toBe('other')
    expect(detectPlatform({ userAgent: '', uaPlatform: 'Android', mobile: true })).toBe(
      'other'
    )
  })

  it('falls back to other for unknown systems', () => {
    expect(
      detectPlatform({ userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 16000.0.0)' })
    ).toBe('other')
  })
})
