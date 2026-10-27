/**
 * The OpenPGP check of yt-dlp's SHA2-256SUMS: the real 2026.08.19 checksums and signature verify against the
 * pinned yt-dlp signing key, any change to them fails, and every field the check reads is held to what that
 * signature uses.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import {
  verifyDetachedSignature,
  v4Fingerprint,
  YTDLP_SIGNING_KEY
} from '@main/binaries/ytdlp/signature'
import { createTestKey, signDetached, type TestKey } from './helpers/pgp'

const FIXTURES = path.join(__dirname, 'fixtures', 'ytdlp')
const SUMS = fs.readFileSync(path.join(FIXTURES, 'SHA2-256SUMS-2026.08.19'))
const SIGNATURE = fs.readFileSync(path.join(FIXTURES, 'SHA2-256SUMS-2026.08.19.sig'))

describe('the pinned yt-dlp signing key', () => {
  it('has the fingerprint its key material hashes to', () => {
    expect(v4Fingerprint(YTDLP_SIGNING_KEY)).toBe(YTDLP_SIGNING_KEY.fingerprint)
    expect(YTDLP_SIGNING_KEY.fingerprint).toBe('AC0CBBE6848D6A873464AF4E57CF65933B5A7581')
  })

  it('verifies the checksums yt-dlp published for 2026.08.19', () => {
    expect(verifyDetachedSignature(SUMS, SIGNATURE)).toEqual({ ok: true })
  })

  it('rejects the same signature over changed checksums', () => {
    const changed = Buffer.from(SUMS)
    changed[0] = changed[0] === 0x30 ? 0x31 : 0x30
    expect(verifyDetachedSignature(changed, SIGNATURE)).toEqual({
      ok: false,
      reason: 'The signature does not match the file'
    })
    expect(
      verifyDetachedSignature(
        Buffer.from(SUMS.toString('utf8').replace(/\n/g, '\r\n')),
        SIGNATURE
      ).ok
    ).toBe(false)
  })

  it('rejects the real signature against another key', () => {
    const other = createTestKey()
    expect(verifyDetachedSignature(SUMS, SIGNATURE, other.key)).toEqual({
      ok: false,
      reason: 'The signature was made by a different key'
    })
  })
})

describe('verifyDetachedSignature', () => {
  let signer: TestKey
  const data = Buffer.from('0123  yt-dlp.exe\n')

  beforeAll(() => {
    signer = createTestKey()
  })

  it('accepts every packet header form and the SHA-2 hashes yt-dlp may use', () => {
    for (const header of ['old', 'new-two', 'new-five'] as const) {
      expect(
        verifyDetachedSignature(data, signDetached(data, signer, { header }), signer.key),
        header
      ).toEqual({ ok: true })
    }
    for (const hash of ['sha256', 'sha384', 'sha512'] as const) {
      expect(
        verifyDetachedSignature(data, signDetached(data, signer, { hash }), signer.key),
        hash
      ).toEqual({ ok: true })
    }
    expect(
      verifyDetachedSignature(
        data,
        signDetached(data, signer, { algorithm: 3 }),
        signer.key
      )
    ).toEqual({ ok: true })
  })

  it('accepts a signature that names its key only by key id', () => {
    expect(
      verifyDetachedSignature(
        data,
        signDetached(data, signer, { issuer: 'key-id' }),
        signer.key
      )
    ).toEqual({ ok: true })
    const wrongId = signDetached(data, signer, {
      issuer: 'key-id',
      issuerHex: '0011223344556677'
    })
    expect(verifyDetachedSignature(data, wrongId, signer.key)).toEqual({
      ok: false,
      reason: 'The signature was made by a different key'
    })
    expect(
      verifyDetachedSignature(
        data,
        signDetached(data, signer, { issuer: 'none' }),
        signer.key
      )
    ).toEqual({ ok: false, reason: 'The signature does not name its key' })
  })

  it('ignores unknown subpackets unless they are critical, at every subpacket length form', () => {
    const extra: Array<[number, Buffer]> = [
      [20, Buffer.alloc(10)],
      [20, Buffer.alloc(300)],
      [20, Buffer.alloc(9000)]
    ]
    expect(
      verifyDetachedSignature(data, signDetached(data, signer, { extra }), signer.key)
    ).toEqual({ ok: true })
    const critical = signDetached(data, signer, { extra: [[0x80 | 20, Buffer.alloc(4)]] })
    expect(verifyDetachedSignature(data, critical, signer.key)).toEqual({
      ok: false,
      reason: 'The signature has a critical subpacket this check does not know'
    })
    const criticalKnown = signDetached(data, signer, {
      extra: [[0x80 | 2, Buffer.alloc(4)]]
    })
    expect(verifyDetachedSignature(data, criticalKnown, signer.key)).toEqual({ ok: true })
  })

  it('rejects what yt-dlp signatures never are', () => {
    const cases: Array<[Parameters<typeof signDetached>[2], string]> = [
      [{ tag: 6 }, 'The file is not an OpenPGP signature'],
      [{ version: 3 }, 'The signature is not a version 4 signature'],
      [{ type: 1 }, 'The signature is not over a binary document'],
      [{ algorithm: 17 }, 'The signature is not an RSA signature'],
      [{ hashId: 2 }, 'The signature uses an unsupported hash'],
      [{ corruptLeft16: true }, 'The signature does not match the file'],
      [{ corruptValue: true }, 'The signature does not match the file'],
      [{ padValue: 4 }, 'The signature value is longer than the key']
    ]
    for (const [options, reason] of cases) {
      expect(
        verifyDetachedSignature(data, signDetached(data, signer, options), signer.key),
        reason
      ).toEqual({ ok: false, reason })
    }
  })

  it('reads malformed packets as failed checks without throwing', () => {
    const good = signDetached(data, signer)
    expect(verifyDetachedSignature(data, Buffer.alloc(0), signer.key)).toEqual({
      ok: false,
      reason: 'The signature is not an OpenPGP packet'
    })
    expect(
      verifyDetachedSignature(
        data,
        Buffer.from('-----BEGIN PGP SIGNATURE-----'),
        signer.key
      )
    ).toEqual({ ok: false, reason: 'The signature is not an OpenPGP packet' })
    expect(
      verifyDetachedSignature(data, good.subarray(0, good.length - 10), signer.key)
    ).toEqual({ ok: false, reason: 'The signature is cut short' })
    expect(
      verifyDetachedSignature(data, Buffer.from([0xc2, 0xe1, 0, 0]), signer.key)
    ).toEqual({ ok: false, reason: 'The signature uses a partial length' })
    expect(verifyDetachedSignature(data, Buffer.from([0x8b, 0, 0]), signer.key)).toEqual({
      ok: false,
      reason: 'The signature has an indeterminate length'
    })

    expect(
      verifyDetachedSignature(
        data,
        signDetached(data, signer, { bits: 4096 }),
        signer.key
      )
    ).toEqual({ ok: false, reason: 'The signature value is cut short' })
    expect(
      verifyDetachedSignature(data, Buffer.from([0xc2, 0x05, 4, 0, 1, 10, 0]), signer.key)
    ).toEqual({ ok: false, reason: 'The signature is not a version 4 signature' })

    const hugeHashed = Buffer.from(good)
    hugeHashed.writeUInt16BE(0xfff0, 3 + 4)
    expect(verifyDetachedSignature(data, hugeHashed, signer.key)).toEqual({
      ok: false,
      reason: 'The signature could not be read'
    })

    const badSub = Buffer.from(good)
    badSub[3 + 6] = 0
    expect(verifyDetachedSignature(data, badSub, signer.key)).toEqual({
      ok: false,
      reason: 'A signature subpacket is cut short'
    })
  })
})
