import { safeStorage } from 'electron'
import { logger } from '../logger'
import { discordStore } from './store'

/**
 * Local, encrypted bot-token storage. The token is encrypted at rest with
 * Electron's safeStorage (OS keychain-backed) and never leaves the main process
 * - the renderer only ever learns whether a token exists, not its value.
 */
export function hasToken(): boolean {
  const s = discordStore()
  return Boolean(s.get('tokenEnc') || s.get('tokenPlain'))
}

export function saveToken(token: string): void {
  const s = discordStore()
  if (safeStorage.isEncryptionAvailable()) {
    s.set('tokenEnc', safeStorage.encryptString(token).toString('base64'))
    s.set('tokenPlain', null)
    logger.info('Stored Discord token (encrypted)')
    return
  }
  // No OS-backed encryption (e.g. a headless Linux session); fall back to plain
  // storage so the feature still works, but make the downgrade visible.
  logger.warn('safeStorage unavailable - storing Discord token unencrypted')
  s.set('tokenPlain', token)
  s.set('tokenEnc', null)
}

export function loadToken(): string | null {
  const s = discordStore()
  const enc = s.get('tokenEnc')
  if (enc && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(enc, 'base64'))
    } catch (err) {
      logger.warn('Failed to decrypt Discord token:', err)
      return null
    }
  }
  return s.get('tokenPlain') ?? null
}

export function clearToken(): void {
  const s = discordStore()
  s.set('tokenEnc', null)
  s.set('tokenPlain', null)
}
