import { safeStorage } from 'electron'
import { logger } from '../logger'
import { discordStore } from './store'

/**
 * Local, encrypted bot-token storage. The token is encrypted at rest with Electron's asynchronous safeStorage API,
 * which keeps its key in the operating system's secure storage, and never leaves the main process: the renderer only
 * learns whether a token exists. Tokens written by the synchronous API in earlier releases decrypt with it unchanged.
 */
export function hasToken(): boolean {
  const s = discordStore()
  return Boolean(s.get('tokenEnc') || s.get('tokenPlain'))
}

async function encryptionAvailable(): Promise<boolean> {
  try {
    return await safeStorage.isAsyncEncryptionAvailable()
  } catch (err) {
    logger.warn('Could not check safeStorage:', err)
    return false
  }
}

/**
 * Whether Chromium encrypted with its fixed fallback key, which protects nothing. On Linux without a keyring service
 * the asynchronous API still encrypts, but with this key, marked by the `v10` prefix there; keyring-backed keys are
 * `v11`. On macOS and Windows `v10` is the Keychain or DPAPI key.
 */
export function usesFixedKey(
  encrypted: Buffer,
  platform: NodeJS.Platform = process.platform
): boolean {
  return platform === 'linux' && encrypted.subarray(0, 3).toString('latin1') === 'v10'
}

export async function saveToken(token: string): Promise<void> {
  const s = discordStore()
  if (await encryptionAvailable()) {
    const encrypted = await safeStorage.encryptStringAsync(token)
    s.set('tokenEnc', encrypted.toString('base64'))
    s.set('tokenPlain', null)
    if (usesFixedKey(encrypted)) {
      logger.warn(
        'No keyring service found - the Discord token is stored with a fixed fallback key and is not protected'
      )
    } else {
      logger.info('Stored Discord token (encrypted)')
    }
    return
  }
  logger.warn('safeStorage unavailable - storing Discord token unencrypted')
  s.set('tokenPlain', token)
  s.set('tokenEnc', null)
}

/** Stores the token again under the operating system's current key. Keeps the stored copy when that fails. */
async function reEncrypt(token: string): Promise<void> {
  try {
    const encrypted = await safeStorage.encryptStringAsync(token)
    discordStore().set('tokenEnc', encrypted.toString('base64'))
    logger.info('Re-encrypted the Discord token under the current key')
  } catch (err) {
    logger.warn('Could not re-encrypt the Discord token:', err)
  }
}

export async function loadToken(): Promise<string | null> {
  const s = discordStore()
  const enc = s.get('tokenEnc')
  if (enc && (await encryptionAvailable())) {
    try {
      const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(
        Buffer.from(enc, 'base64')
      )
      if (shouldReEncrypt) await reEncrypt(result)
      return result
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
