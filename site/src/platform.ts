import type { Platform } from './release'

export interface PlatformHints {
  userAgent: string
  platform?: string
  uaPlatform?: string
  mobile?: boolean
  maxTouchPoints?: number
}

/** Picks the installer family for a browser. Phones and tablets get 'other'. */
export function detectPlatform(hints: PlatformHints): Platform {
  const ua = hints.userAgent.toLowerCase()
  const platform = (hints.uaPlatform || hints.platform || '').toLowerCase()
  if (hints.mobile || /android|iphone|ipad|ipod|mobile|cros/.test(ua)) return 'other'
  if (platform.startsWith('win') || ua.includes('windows')) return 'windows'
  if (platform.startsWith('mac') || ua.includes('mac os x') || ua.includes('macintosh')) {
    return (hints.maxTouchPoints ?? 0) > 1 ? 'other' : 'mac'
  }
  if (platform.includes('linux') || ua.includes('linux') || ua.includes('x11'))
    return 'linux'
  return 'other'
}

export function currentPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other'
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string; mobile?: boolean }
  }
  return detectPlatform({
    userAgent: nav.userAgent,
    platform: nav.platform,
    uaPlatform: nav.userAgentData?.platform,
    mobile: nav.userAgentData?.mobile,
    maxTouchPoints: nav.maxTouchPoints
  })
}
