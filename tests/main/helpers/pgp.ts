/**
 * Builds detached OpenPGP v4 signatures with a throwaway RSA key, so tests can sign their own checksum files and
 * shape every field the verifier reads.
 */
import {
  constants,
  createHash,
  generateKeyPairSync,
  sign,
  type KeyObject
} from 'node:crypto'
import { v4Fingerprint, type PgpRsaKey } from '@main/binaries/ytdlp/signature'

/** A throwaway RSA key as the verifier takes it, with its private half. */
export interface TestKey {
  key: PgpRsaKey
  privateKey: KeyObject
}

/** A new 2048-bit RSA key created at a fixed time. */
export function createTestKey(): TestKey {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = publicKey.export({ format: 'jwk' }) as { n: string; e: string }
  const base = { created: 1_700_000_000, n: jwk.n, e: jwk.e }
  return { key: { ...base, fingerprint: v4Fingerprint(base) }, privateKey }
}

/** How to shape a test signature; every field defaults to what yt-dlp's signatures use. */
export interface SignOptions {
  hash?: 'sha256' | 'sha384' | 'sha512'
  /** The hash algorithm id written in the packet, when it should differ from `hash`. */
  hashId?: number
  type?: number
  algorithm?: number
  version?: number
  issuer?: 'fingerprint' | 'key-id' | 'none'
  /** The fingerprint or key id to name instead of the signing key's. */
  issuerHex?: string
  /** Extra hashed subpackets as [type byte, body]. */
  extra?: Array<[number, Buffer]>
  header?: 'old' | 'new-two' | 'new-five' | 'new-one'
  tag?: number
  corruptLeft16?: boolean
  corruptValue?: boolean
  /** Bytes put before the signature value, making it longer than the key. */
  padValue?: number
  /** The bit count written before the signature value, when it should lie. */
  bits?: number
}

const HASH_IDS = { sha256: 8, sha384: 9, sha512: 10 } as const

function subpacket(type: number, body: Buffer): Buffer {
  const length = body.length + 1
  if (length < 192) {
    return Buffer.concat([Buffer.from([length, type]), body])
  }
  if (length < 8384) {
    const value = length - 192
    return Buffer.concat([Buffer.from([(value >> 8) + 192, value & 0xff, type]), body])
  }
  const head = Buffer.alloc(6)
  head[0] = 0xff
  head.writeUInt32BE(length, 1)
  head[5] = type
  return Buffer.concat([head, body])
}

function u16(value: number): Buffer {
  const out = Buffer.alloc(2)
  out.writeUInt16BE(value)
  return out
}

function packet(
  tag: number,
  body: Buffer,
  header: NonNullable<SignOptions['header']>
): Buffer {
  if (header === 'old') {
    return Buffer.concat([Buffer.from([0x80 | (tag << 2) | 1]), u16(body.length), body])
  }
  if (header === 'new-one') {
    return Buffer.concat([Buffer.from([0xc0 | tag, body.length]), body])
  }
  if (header === 'new-two') {
    const value = body.length - 192
    return Buffer.concat([
      Buffer.from([0xc0 | tag, (value >> 8) + 192, value & 0xff]),
      body
    ])
  }
  const length = Buffer.alloc(4)
  length.writeUInt32BE(body.length)
  return Buffer.concat([Buffer.from([0xc0 | tag, 0xff]), length, body])
}

/** A detached binary signature over `data`. */
export function signDetached(
  data: Buffer,
  signer: TestKey,
  options: SignOptions = {}
): Buffer {
  const hash = options.hash ?? 'sha512'
  const created = Buffer.alloc(4)
  created.writeUInt32BE(1_760_000_000)
  const issuer = options.issuer ?? 'fingerprint'
  const fingerprint = Buffer.from(options.issuerHex ?? signer.key.fingerprint, 'hex')
  const hashedParts: Buffer[] = []
  if (issuer === 'fingerprint') {
    hashedParts.push(subpacket(33, Buffer.concat([Buffer.from([4]), fingerprint])))
  }
  hashedParts.push(subpacket(2, created))
  for (const [type, body] of options.extra ?? []) {
    hashedParts.push(subpacket(type, body))
  }
  const hashed = Buffer.concat(hashedParts)
  const unhashed =
    issuer === 'key-id'
      ? subpacket(
          16,
          Buffer.from(options.issuerHex ?? signer.key.fingerprint.slice(-16), 'hex')
        )
      : Buffer.alloc(0)
  const head = Buffer.concat([
    Buffer.from([
      options.version ?? 4,
      options.type ?? 0,
      options.algorithm ?? 1,
      options.hashId ?? HASH_IDS[hash]
    ]),
    u16(hashed.length),
    hashed
  ])
  const trailer = Buffer.alloc(6)
  trailer[0] = 4
  trailer[1] = 0xff
  trailer.writeUInt32BE(head.length, 2)
  const signed = Buffer.concat([data, head, trailer])
  const digest = createHash(hash).update(signed).digest()
  let value = sign(hash, signed, {
    key: signer.privateKey,
    padding: constants.RSA_PKCS1_PADDING
  })
  if (options.corruptValue) {
    value = Buffer.from(value)
    value[value.length - 1] ^= 0xff
  }
  if (options.padValue) {
    value = Buffer.concat([Buffer.alloc(options.padValue, 1), value])
  }
  const left16 = Buffer.from(digest.subarray(0, 2))
  if (options.corruptLeft16) {
    left16[0] ^= 0xff
  }
  let start = 0
  while (start < value.length - 1 && value[start] === 0) {
    start++
  }
  const bytes = value.subarray(start)
  const bits = (bytes.length - 1) * 8 + (32 - Math.clz32(bytes[0]))
  const body = Buffer.concat([
    head,
    u16(unhashed.length),
    unhashed,
    left16,
    u16(options.bits ?? bits),
    bytes
  ])
  return packet(options.tag ?? 2, body, options.header ?? 'old')
}
