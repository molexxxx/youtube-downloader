/**
 * The Discord token store against a stand-in for Electron's asynchronous safeStorage API: tokens are encrypted at rest,
 * tokens from earlier releases still load, a rotated key re-encrypts the stored copy, and a machine without OS-backed
 * encryption falls back to plain storage. The synchronous API, which Electron 46 removes, must not be used.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { safe, data, log } = vi.hoisted(() => {
  const data: Record<string, unknown> = {}
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  const removed = (name: string) =>
    vi.fn(() => {
      throw new Error(`synchronous safeStorage.${name} was called`)
    })
  const safe = {
    available: true,
    keyVersion: 1,
    failEncrypt: false,
    isAsyncEncryptionAvailable: vi.fn(async () => safe.available),
    encryptStringAsync: vi.fn(async (text: string) => {
      if (safe.failEncrypt) throw new Error('keychain locked')
      return Buffer.from(`k${safe.keyVersion}:${text}`)
    }),
    decryptStringAsync: vi.fn(async (encrypted: Buffer) => {
      const match = /^k(\d+):(.*)$/s.exec(encrypted.toString())
      if (!match) throw new Error('Error while decrypting the ciphertext provided')
      return { result: match[2], shouldReEncrypt: Number(match[1]) < safe.keyVersion }
    }),
    isEncryptionAvailable: removed('isEncryptionAvailable'),
    encryptString: removed('encryptString'),
    decryptString: removed('decryptString')
  }
  return { safe, data, log }
})

vi.mock('electron', () => ({ safeStorage: safe }))
vi.mock('@main/logger', () => ({ logger: log }))
vi.mock('@main/discord/store', () => ({
  discordStore: () => ({
    get: (key: string) => data[key] ?? null,
    set: (key: string, value: unknown) => {
      data[key] = value
    }
  })
}))

import {
  clearToken,
  hasToken,
  loadToken,
  saveToken,
  usesFixedKey
} from '@main/discord/token'

const stored = (key: string): unknown => data[key] ?? null
const encoded = (text: string): string => Buffer.from(text).toString('base64')

beforeEach(() => {
  for (const key of Object.keys(data)) delete data[key]
  safe.available = true
  safe.keyVersion = 1
  safe.failEncrypt = false
})

describe('Discord token store', () => {
  it('encrypts the token at rest and reads it back', async () => {
    await saveToken('bot-token')
    expect(stored('tokenEnc')).toBe(encoded('k1:bot-token'))
    expect(stored('tokenPlain')).toBeNull()
    expect(hasToken()).toBe(true)
    expect(await loadToken()).toBe('bot-token')
  })

  it('reads a token an earlier release stored', async () => {
    data.tokenEnc = encoded('k1:legacy-token')
    expect(await loadToken()).toBe('legacy-token')
    expect(safe.encryptStringAsync).not.toHaveBeenCalled()
  })

  it('stores the token again when the operating system rotated its key', async () => {
    data.tokenEnc = encoded('k1:bot-token')
    safe.keyVersion = 2
    expect(await loadToken()).toBe('bot-token')
    expect(stored('tokenEnc')).toBe(encoded('k2:bot-token'))
    expect(await loadToken()).toBe('bot-token')
    expect(safe.encryptStringAsync).toHaveBeenCalledTimes(1)
  })

  it('keeps the stored copy when re-encrypting fails', async () => {
    data.tokenEnc = encoded('k1:bot-token')
    safe.keyVersion = 2
    safe.failEncrypt = true
    expect(await loadToken()).toBe('bot-token')
    expect(stored('tokenEnc')).toBe(encoded('k1:bot-token'))
    expect(log.warn).toHaveBeenCalledWith(
      'Could not re-encrypt the Discord token:',
      expect.any(Error)
    )
  })

  it('stores the token plain, and says so, without OS-backed encryption', async () => {
    safe.available = false
    await saveToken('bot-token')
    expect(stored('tokenPlain')).toBe('bot-token')
    expect(stored('tokenEnc')).toBeNull()
    expect(log.warn).toHaveBeenCalledWith(
      'safeStorage unavailable - storing Discord token unencrypted'
    )
    expect(await loadToken()).toBe('bot-token')
  })

  it('treats a failing availability check as no encryption', async () => {
    safe.isAsyncEncryptionAvailable.mockRejectedValueOnce(new Error('portal timed out'))
    await saveToken('bot-token')
    expect(stored('tokenPlain')).toBe('bot-token')
  })

  it('returns no token when the stored copy cannot be decrypted', async () => {
    data.tokenEnc = encoded('garbage')
    expect(await loadToken()).toBeNull()
    expect(log.warn).toHaveBeenCalledWith(
      'Failed to decrypt Discord token:',
      expect.any(Error)
    )
  })

  it('forgets the token', async () => {
    await saveToken('bot-token')
    clearToken()
    expect(hasToken()).toBe(false)
    expect(await loadToken()).toBeNull()
  })

  it('recognizes the fixed fallback key Linux uses without a keyring service', () => {
    expect(usesFixedKey(Buffer.from('v10abc'), 'linux')).toBe(true)
    expect(usesFixedKey(Buffer.from('v11abc'), 'linux')).toBe(false)
    expect(usesFixedKey(Buffer.from('v10abc'), 'darwin')).toBe(false)
    expect(usesFixedKey(Buffer.from('v10abc'), 'win32')).toBe(false)
  })

  it('warns when the token ends up under the fixed fallback key', async () => {
    const platform = Object.getOwnPropertyDescriptor(
      process,
      'platform'
    ) as PropertyDescriptor
    Object.defineProperty(process, 'platform', { value: 'linux' })
    safe.encryptStringAsync.mockResolvedValueOnce(Buffer.from('v10ciphertext'))
    try {
      await saveToken('bot-token')
    } finally {
      Object.defineProperty(process, 'platform', platform)
    }
    expect(stored('tokenEnc')).toBe(encoded('v10ciphertext'))
    expect(log.warn).toHaveBeenCalledWith(
      'No keyring service found - the Discord token is stored with a fixed fallback key and is not protected'
    )
    expect(log.info).not.toHaveBeenCalledWith('Stored Discord token (encrypted)')
  })

  it('never calls the synchronous API', async () => {
    await saveToken('bot-token')
    await loadToken()
    safe.available = false
    await saveToken('bot-token')
    await loadToken()
    expect(safe.isEncryptionAvailable).not.toHaveBeenCalled()
    expect(safe.encryptString).not.toHaveBeenCalled()
    expect(safe.decryptString).not.toHaveBeenCalled()
  })
})
