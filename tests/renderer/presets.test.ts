import { describe, expect, it } from 'vitest'
import { PRESETS, getPreset } from '@shared/presets'

describe('presets', () => {
  it('exposes a known default preset', () => {
    expect(getPreset('best-mp4')).toMatchObject({ kind: 'video', container: 'mp4' })
  })

  it('returns undefined for unknown ids', () => {
    expect(getPreset('nope')).toBeUndefined()
  })

  it('has unique ids', () => {
    const ids = PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('audio presets carry an audio format and no container', () => {
    for (const p of PRESETS.filter((x) => x.kind === 'audio')) {
      expect(p.audioFormat).toBeTruthy()
      expect(p.container).toBeUndefined()
    }
  })

  it('video presets carry a container', () => {
    for (const p of PRESETS.filter((x) => x.kind === 'video')) {
      expect(p.container).toBeTruthy()
    }
  })
})
