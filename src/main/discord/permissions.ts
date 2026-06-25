import { getGuildSettings } from './settings'

/** The bits of a Discord guild member needed to decide playback permission. */
export interface MemberContext {
  userId: string
  roleIds: string[]
  isAdministrator: boolean
  isGuildOwner: boolean
}

/**
 * Whether a Discord member may drive playback in a guild. When the guild has an
 * allowed role configured, only the owner, administrators, or members holding
 * that role may control the bot. With no role set, anyone may. The local UI is
 * the host and is never gated by this check.
 */
export function canControl(guildId: string, member: MemberContext): boolean {
  const { allowedRoleId } = getGuildSettings(guildId)
  if (!allowedRoleId) return true
  if (member.isGuildOwner || member.isAdministrator) return true
  return member.roleIds.includes(allowedRoleId)
}
