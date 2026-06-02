import { describe, expect, it } from 'vitest'
import { mergeConfig } from '@main/config'
import { DEFAULT_CONFIG } from '@shared/types'

describe('mergeConfig', () => {
  it('returns defaults when stored is empty', () => {
    expect(mergeConfig({})).toEqual(DEFAULT_CONFIG)
  })

  it('overrides defaults with stored values', () => {
    const merged = mergeConfig({ maxConcurrentDownloads: 8, theme: 'dark' })
    expect(merged.maxConcurrentDownloads).toBe(8)
    expect(merged.theme).toBe('dark')
    expect(merged.outputTemplate).toBe(DEFAULT_CONFIG.outputTemplate)
  })

  it('does not mutate the defaults object', () => {
    mergeConfig({ sponsorBlock: true })
    expect(DEFAULT_CONFIG.sponsorBlock).toBe(false)
  })
})
