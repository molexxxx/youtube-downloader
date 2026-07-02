import ElectronStore from 'electron-store'
import type { GuildSettings } from '@shared/types'

// electron-store v11 is ESM-only; under CJS interop unwrap the default export so
// the constructor is always callable (mirrors config.ts / history.ts).
const StoreCtor = ((ElectronStore as unknown as { default?: typeof ElectronStore })
  .default ?? ElectronStore) as typeof ElectronStore

export interface DiscordStoreShape {
  /** safeStorage-encrypted bot token, base64. Null when none or stored plain. */
  tokenEnc: string | null
  /** Plain bot token, used only as a fallback when safeStorage is unavailable. */
  tokenPlain: string | null
  /** Reconnect automatically on launch when a token is present. */
  autoConnect: boolean
  guildSettings: Record<string, GuildSettings>
}

let store: ElectronStore<DiscordStoreShape> | null = null

/** The single local 'discord' store backing the token and per-guild settings. */
export function discordStore(): ElectronStore<DiscordStoreShape> {
  if (!store) {
    store = new StoreCtor<DiscordStoreShape>({
      name: 'discord',
      defaults: {
        tokenEnc: null,
        tokenPlain: null,
        autoConnect: true,
        guildSettings: {}
      }
    })
  }
  return store
}
