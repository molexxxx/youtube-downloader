import { beforeEach, describe, expect, it, vi } from 'vitest'

const { state } = vi.hoisted(() => ({ state: { allowedRoleId: null as string | null } }))

vi.mock('@main/discord/settings', () => ({
  getGuildSettings: () => ({
    allowedRoleId: state.allowedRoleId,
    defaultVolume: 100,
    autoLeaveOnEmpty: true,
    lastVoiceChannelId: null
  })
}))

import { canControl, type MemberContext } from '@main/discord/permissions'

function member(over: Partial<MemberContext> = {}): MemberContext {
  return {
    userId: 'u1',
    roleIds: [],
    isAdministrator: false,
    isGuildOwner: false,
    ...over
  }
}

describe('canControl', () => {
  beforeEach(() => {
    state.allowedRoleId = null
  })

  it('allows anyone when no role is configured', () => {
    expect(canControl('g1', member())).toBe(true)
  })

  it('allows members holding the required role', () => {
    state.allowedRoleId = 'role-dj'
    expect(canControl('g1', member({ roleIds: ['role-dj'] }))).toBe(true)
    expect(canControl('g1', member({ roleIds: ['other'] }))).toBe(false)
  })

  it('always allows the guild owner and administrators', () => {
    state.allowedRoleId = 'role-dj'
    expect(canControl('g1', member({ isGuildOwner: true }))).toBe(true)
    expect(canControl('g1', member({ isAdministrator: true }))).toBe(true)
  })
})
