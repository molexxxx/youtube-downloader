import { DEFAULT_GUILD_SETTINGS, type GuildSettings } from '@shared/types'
import { discordStore } from './store'

/** Per-guild settings, merged over defaults so older stores gain new fields. */
export function getGuildSettings(guildId: string): GuildSettings {
  const all = discordStore().get('guildSettings')
  return { ...DEFAULT_GUILD_SETTINGS, ...(all[guildId] ?? {}) }
}

export function setGuildSettings(
  guildId: string,
  partial: Partial<GuildSettings>
): GuildSettings {
  const s = discordStore()
  const all = { ...s.get('guildSettings') }
  const next: GuildSettings = { ...getGuildSettings(guildId), ...partial }
  all[guildId] = next
  s.set('guildSettings', all)
  return next
}

export function getAutoConnect(): boolean {
  return discordStore().get('autoConnect')
}

export function setAutoConnect(value: boolean): void {
  discordStore().set('autoConnect', value)
}
