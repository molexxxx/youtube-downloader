/**
 * Verifies the detached OpenPGP signature yt-dlp publishes beside each release's SHA2-256SUMS against the yt-dlp
 * signing key pinned here, with Node's crypto and no OpenPGP library. Only what that signature uses is accepted: a
 * binary v4 signature packet, an RSA key, and SHA-256, SHA-384, or SHA-512.
 */
import { constants, createHash, createPublicKey, verify } from 'crypto'

/** An RSA OpenPGP v4 public key: its fingerprint, creation time in Unix seconds, and modulus and exponent as base64url. */
export interface PgpRsaKey {
  fingerprint: string
  created: number
  n: string
  e: string
}

/**
 * The yt-dlp release signing key, "Simon Sawicki (yt-dlp signing key)", as published in `public.key` of the yt-dlp
 * repository (unchanged since 2023-03-03). It signs the stable, nightly, and master channels' checksums.
 */
export const YTDLP_SIGNING_KEY: PgpRsaKey = {
  fingerprint: 'AC0CBBE6848D6A873464AF4E57CF65933B5A7581',
  created: 1677455406,
  n: '9Kxfc4xjwLdLYZbeQtXm83HAFV-zW9b_nqkI5PlhGXUxE1QoN1gDOZ4AK5R3Zv32as1IDvqQGKwetBinoO331A3_ktFxShGXXkS2HgGqqioUom1WpQ47zgTs7bt1utOxyxE0AKgO8Ez7iLdlqpqS-tDSHMq9uy8apoHTd5jb2doizvmz9Jykfwvj4BPR-MrcsA2tdszMej5mQp1Tjjrul2RBZnVMcXUPXxQ6nfS3ASmNiwznEmKNbGmNGFomVh7c1aGbtZDs450uRY6v8gRySyJgx-6TcR5u7Pz52rq6ZkBbQxa7pLftpYQ56SlJhq_yP9yB6h_1_vZz6EuLoqkOR6W5QfASvuFn6WohIO-S577jj32SDymMl2v9AO0KIzMIDqw_PKM0_lQpCpJCfoo12e4BzY5nAWlHSiu3wyBDmCOty8nOkFpBkE4oBX30lF1hwwjvWlzYT93o6hVoBjLQlLK25HCZFrlmO6uQEcv9OR20jNyuA1PXqrZ8ZoldVkPJ17iPSYCUEb4eT05J8uS7cas3Jqr1jvU4xwW67NeATxDvX3F8Si_whQW81w0r7wIAK3aqpTKJ3EP8onE5Xy-qsyfBChYqlteEDE3QJ-krrmU6HVwk4iJ8KE-1o47hTyinb3x9Rj-G56nc058y8QkgyBLX8nz7CF_vRiOyZJP82Y0',
  e: 'AQAB'
}

/** The result of a signature check, with the reason when it fails. */
export type SignatureCheck = { ok: true } | { ok: false; reason: string }

const SIGNATURE_TAG = 2
const BINARY_DOCUMENT = 0x00
const RSA_ALGORITHMS = new Set([1, 3])
const HASHES: Readonly<Record<number, string>> = {
  8: 'sha256',
  9: 'sha384',
  10: 'sha512'
}
const SUBPACKET_CREATED = 2
const SUBPACKET_ISSUER = 16
const SUBPACKET_FINGERPRINT = 33
const KNOWN_SUBPACKETS = new Set([
  SUBPACKET_CREATED,
  SUBPACKET_ISSUER,
  SUBPACKET_FINGERPRINT
])

class SignatureError extends Error {}

function need(condition: boolean, reason: string): void {
  if (!condition) {
    throw new SignatureError(reason)
  }
}

/** The body of the first packet in `data`, in the old or the new OpenPGP packet format. */
function readPacket(data: Buffer): { tag: number; body: Buffer } {
  need(
    data.length >= 2 && (data[0] & 0x80) !== 0,
    'The signature is not an OpenPGP packet'
  )
  const head = data[0]
  let tag: number
  let length: number
  let offset: number
  if ((head & 0x40) !== 0) {
    tag = head & 0x3f
    const first = data[1]
    need(first < 224 || first === 255, 'The signature uses a partial length')
    if (first < 192) {
      length = first
      offset = 2
    } else if (first < 224) {
      length = ((first - 192) << 8) + data[2] + 192
      offset = 3
    } else {
      length = data.readUInt32BE(2)
      offset = 6
    }
  } else {
    tag = (head >> 2) & 0x0f
    const lengthType = head & 0x03
    need(lengthType !== 3, 'The signature has an indeterminate length')
    const sizes = [1, 2, 4]
    length = data.readUIntBE(1, sizes[lengthType])
    offset = 1 + sizes[lengthType]
  }
  need(offset + length <= data.length, 'The signature is cut short')
  return { tag, body: data.subarray(offset, offset + length) }
}

/** The subpackets of a signature's hashed or unhashed area. */
function readSubpackets(
  area: Buffer
): { type: number; critical: boolean; body: Buffer }[] {
  const out: { type: number; critical: boolean; body: Buffer }[] = []
  let i = 0
  while (i < area.length) {
    const first = area[i]
    let length: number
    let header: number
    if (first < 192) {
      length = first
      header = 1
    } else if (first < 255) {
      length = ((first - 192) << 8) + area[i + 1] + 192
      header = 2
    } else {
      length = area.readUInt32BE(i + 1)
      header = 5
    }
    need(
      length >= 1 && i + header + length <= area.length,
      'A signature subpacket is cut short'
    )
    const type = area[i + header]
    out.push({
      type: type & 0x7f,
      critical: (type & 0x80) !== 0,
      body: area.subarray(i + header + 1, i + header + length)
    })
    i += header + length
  }
  return out
}

/** An MPI: the bit count as two bytes, then the value without leading zero bytes. */
function mpi(value: Buffer): Buffer {
  let start = 0
  while (start < value.length - 1 && value[start] === 0) {
    start++
  }
  const bytes = value.subarray(start)
  const bits = (bytes.length - 1) * 8 + (bytes[0] === 0 ? 0 : 32 - Math.clz32(bytes[0]))
  const head = Buffer.alloc(2)
  head.writeUInt16BE(bits)
  return Buffer.concat([head, bytes])
}

/** The v4 fingerprint of an RSA key: SHA-1 over its public key packet, as uppercase hex. */
export function v4Fingerprint(key: Pick<PgpRsaKey, 'created' | 'n' | 'e'>): string {
  const head = Buffer.alloc(6)
  head[0] = 4
  head.writeUInt32BE(key.created, 1)
  head[5] = 1
  const body = Buffer.concat([
    head,
    mpi(Buffer.from(key.n, 'base64url')),
    mpi(Buffer.from(key.e, 'base64url'))
  ])
  const prefix = Buffer.from([0x99, body.length >> 8, body.length & 0xff])
  return createHash('sha1').update(prefix).update(body).digest('hex').toUpperCase()
}

function check(data: Buffer, signature: Buffer, key: PgpRsaKey): void {
  const packet = readPacket(signature)
  need(packet.tag === SIGNATURE_TAG, 'The file is not an OpenPGP signature')
  const body = packet.body
  need(body.length >= 6 && body[0] === 4, 'The signature is not a version 4 signature')
  need(body[1] === BINARY_DOCUMENT, 'The signature is not over a binary document')
  need(RSA_ALGORITHMS.has(body[2]), 'The signature is not an RSA signature')
  const hash = HASHES[body[3]]
  need(hash !== undefined, 'The signature uses an unsupported hash')

  const hashedLength = body.readUInt16BE(4)
  const hashedEnd = 6 + hashedLength
  const unhashedLength = body.readUInt16BE(hashedEnd)
  const unhashedEnd = hashedEnd + 2 + unhashedLength
  const hashed = readSubpackets(body.subarray(6, hashedEnd))
  const unhashed = readSubpackets(body.subarray(hashedEnd + 2, unhashedEnd))
  for (const sub of hashed) {
    need(
      !sub.critical || KNOWN_SUBPACKETS.has(sub.type),
      'The signature has a critical subpacket this check does not know'
    )
  }

  const fingerprint = key.fingerprint.toUpperCase()
  const issuers = [...hashed, ...unhashed]
  const named = issuers.find((sub) => sub.type === SUBPACKET_FINGERPRINT)
  const keyId = issuers.find((sub) => sub.type === SUBPACKET_ISSUER)
  if (named) {
    need(
      named.body.subarray(1).toString('hex').toUpperCase() === fingerprint,
      'The signature was made by a different key'
    )
  } else {
    need(keyId !== undefined, 'The signature does not name its key')
    need(
      keyId!.body.toString('hex').toUpperCase() === fingerprint.slice(-16),
      'The signature was made by a different key'
    )
  }

  const left16 = body.subarray(unhashedEnd, unhashedEnd + 2)
  const bits = body.readUInt16BE(unhashedEnd + 2)
  const value = body.subarray(unhashedEnd + 4, unhashedEnd + 4 + Math.ceil(bits / 8))
  need(
    value.length === Math.ceil(bits / 8) && value.length > 0,
    'The signature value is cut short'
  )

  const trailer = Buffer.alloc(6)
  trailer[0] = 4
  trailer[1] = 0xff
  trailer.writeUInt32BE(hashedEnd, 2)
  const signed = Buffer.concat([data, body.subarray(0, hashedEnd), trailer])
  need(
    createHash(hash).update(signed).digest().subarray(0, 2).equals(left16),
    'The signature does not match the file'
  )

  const modulus = Buffer.from(key.n, 'base64url')
  need(value.length <= modulus.length, 'The signature value is longer than the key')
  const padded = Buffer.concat([Buffer.alloc(modulus.length - value.length), value])
  const publicKey = createPublicKey({
    key: { kty: 'RSA', n: key.n, e: key.e },
    format: 'jwk'
  })
  need(
    verify(
      hash,
      signed,
      { key: publicKey, padding: constants.RSA_PKCS1_PADDING },
      padded
    ),
    'The signature does not match the file'
  )
}

/**
 * Checks a detached binary OpenPGP signature over `data`, made by `key` (the yt-dlp signing key unless a test passes
 * another). Never throws; a malformed signature reads as a failed check with its reason.
 */
export function verifyDetachedSignature(
  data: Buffer,
  signature: Buffer,
  key: PgpRsaKey = YTDLP_SIGNING_KEY
): SignatureCheck {
  try {
    check(data, signature, key)
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      reason:
        err instanceof SignatureError ? err.message : 'The signature could not be read'
    }
  }
}
