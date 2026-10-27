import { describe, expect, it, vi } from 'vitest'

vi.mock('@main/discord/resolve', () => ({
  resolveQueryToTracks: vi.fn(),
  searchTracks: vi.fn()
}))
vi.mock('@main/discord/audit', () => ({ addAudit: vi.fn() }))

import { buildCommands } from '@main/discord/commands'

const commands = buildCommands().map((c) => c.toJSON())

describe('buildCommands', () => {
  it('registers unique names with descriptions inside Discord limits', () => {
    const names = commands.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
    for (const c of commands) {
      expect(c.description.length, c.name).toBeGreaterThan(0)
      expect(c.description.length, c.name).toBeLessThanOrEqual(100)
    }
  })

  it('describes /search as a picker rather than an instant queue', () => {
    const search = commands.find((c) => c.name === 'search')
    expect(search?.description).toBe(
      'Search YouTube and pick one of the top 5 results to queue'
    )
  })
})
