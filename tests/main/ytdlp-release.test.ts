/**
 * yt-dlp release facts: the standalone asset per platform, version parsing and order, the GNU sums format, the
 * latest release from the API or the releases/latest redirect, the signed checksums, and how failures read.
 */
import { describe, it, expect, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import {
  HttpStatusError,
  RefusedUrlError,
  TooLargeError,
  type Http
} from '@main/binaries/net'
import {
  assetFor,
  checksumFor,
  compareVersions,
  executableName,
  fetchSignedSums,
  parseVersion,
  problemOf,
  queryLatest,
  releaseFileUrl,
  YtdlpUpdateError
} from '@main/binaries/ytdlp/release'
import { verifyDetachedSignature } from '@main/binaries/ytdlp/signature'

const FIXTURES = path.join(__dirname, 'fixtures', 'ytdlp')
const SUMS = fs.readFileSync(path.join(FIXTURES, 'SHA2-256SUMS-2026.08.19'))
const SIGNATURE = fs.readFileSync(path.join(FIXTURES, 'SHA2-256SUMS-2026.08.19.sig'))

function http(overrides: Partial<Http> = {}): Http {
  return {
    getJson: vi.fn(async () => ({})),
    getBuffer: vi.fn(async () => Buffer.alloc(0)),
    redirectTarget: vi.fn(async () => null),
    download: vi.fn(async () => ({ bytes: 0, sha256: '' })),
    ...overrides
  }
}

describe('release assets', () => {
  it('picks the standalone, self-updatable build the README lists for each platform', () => {
    expect(assetFor('win32', 'x64')).toBe('yt-dlp.exe')
    expect(assetFor('win32', 'arm64')).toBe('yt-dlp_arm64.exe')
    expect(assetFor('win32', 'ia32')).toBe('yt-dlp_x86.exe')
    expect(assetFor('darwin', 'arm64')).toBe('yt-dlp_macos')
    expect(assetFor('darwin', 'x64')).toBe('yt-dlp_macos')
    expect(assetFor('linux', 'x64')).toBe('yt-dlp_linux')
    expect(assetFor('linux', 'arm64')).toBe('yt-dlp_linux_aarch64')
    expect(assetFor('linux', 'arm')).toBeNull()
    expect(assetFor('win32', 'mips')).toBeNull()
    expect(assetFor('freebsd', 'x64')).toBeNull()
    expect(executableName('win32')).toBe('yt-dlp.exe')
    expect(executableName('linux')).toBe('yt-dlp')
  })

  it('lists every chosen asset in the real 2026.08.19 checksums', () => {
    const text = SUMS.toString('utf8')
    for (const name of [
      'yt-dlp.exe',
      'yt-dlp_arm64.exe',
      'yt-dlp_x86.exe',
      'yt-dlp_macos',
      'yt-dlp_linux',
      'yt-dlp_linux_aarch64'
    ]) {
      expect(checksumFor(text, name), name).toMatch(/^[0-9a-f]{64}$/)
    }
    expect(checksumFor(text, 'yt-dlp.exe')).toBe(
      '66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a'
    )
    expect(releaseFileUrl('2026.08.19', 'yt-dlp.exe')).toBe(
      'https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp.exe'
    )
  })
})

describe('versions and sums', () => {
  it('reads stable and nightly versions and nothing else', () => {
    expect(parseVersion('2026.08.19\n')).toBe('2026.08.19')
    expect(parseVersion('  2026.10.10.233141\r\nextra')).toBe('2026.10.10.233141')
    expect(parseVersion('2023.3.4')).toBe('2023.3.4')
    expect(parseVersion('yt-dlp 2026.08.19')).toBeNull()
    expect(parseVersion('')).toBeNull()
    expect(parseVersion('Traceback (most recent call last)')).toBeNull()
  })

  it('orders versions by their numbers', () => {
    expect(compareVersions('2026.08.19', '2026.07.04')).toBe(1)
    expect(compareVersions('2026.07.04', '2026.08.19')).toBe(-1)
    expect(compareVersions('2026.08.19', '2026.08.19')).toBe(0)
    expect(compareVersions('2026.08.19.1', '2026.08.19')).toBe(1)
    expect(compareVersions('2026.10.1', '2026.9.30')).toBe(1)
  })

  it('finds a checksum by its exact name in the GNU text and binary forms', () => {
    const sums = `${'A'.repeat(64)}  yt-dlp.exe\n${'b'.repeat(64)} *yt-dlp_x86.exe\nnot a line\n${'c'.repeat(64)}  yt-dlp`
    expect(checksumFor(sums, 'yt-dlp.exe')).toBe('a'.repeat(64))
    expect(checksumFor(sums, 'yt-dlp_x86.exe')).toBe('b'.repeat(64))
    expect(checksumFor(sums, 'yt-dlp')).toBe('c'.repeat(64))
    expect(checksumFor(sums, 'exe')).toBeNull()
    expect(checksumFor('', 'yt-dlp.exe')).toBeNull()
  })
})

describe('queryLatest', () => {
  it("reads the tag and this computer's asset size from the API", async () => {
    const net = http({
      getJson: vi.fn(async () => ({
        tag_name: '2026.08.19',
        assets: [
          { name: 'yt-dlp_macos', size: 1 },
          { name: 'yt-dlp.exe', size: 17840399 }
        ]
      }))
    })
    await expect(queryLatest(net, 'yt-dlp.exe')).resolves.toEqual({
      version: '2026.08.19',
      bytes: 17840399
    })
    await expect(queryLatest(net, 'yt-dlp_linux')).resolves.toEqual({
      version: '2026.08.19',
      bytes: null
    })
    expect(net.redirectTarget).not.toHaveBeenCalled()
  })

  it('falls back to the releases/latest redirect when the API refuses or answers oddly', async () => {
    const target = 'https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19'
    for (const getJson of [
      vi.fn(async () => {
        throw new HttpStatusError('api', 403)
      }),
      vi.fn(async () => ({ tag_name: 'nightly' })),
      vi.fn(async () => null),
      vi.fn(async () => ({ tag_name: '2026.08.19', assets: 'none' }))
    ]) {
      const net = http({ getJson, redirectTarget: vi.fn(async () => target) })
      const latest = await queryLatest(net, 'yt-dlp.exe')
      expect(latest.version).toBe('2026.08.19')
    }
  })

  it('names the problem when neither lookup works', async () => {
    const refused = http({
      getJson: vi.fn(async () => {
        throw new HttpStatusError('api', 429)
      }),
      redirectTarget: vi.fn(async () => null)
    })
    await expect(queryLatest(refused, 'yt-dlp.exe')).rejects.toMatchObject({
      problem: 'rate-limited'
    })
    const offline = http({
      getJson: vi.fn(async () => {
        throw Object.assign(new Error('getaddrinfo ENOTFOUND api.github.com'), {
          code: 'ENOTFOUND'
        })
      }),
      redirectTarget: vi.fn(async () => {
        throw new Error('down')
      })
    })
    await expect(queryLatest(offline, 'yt-dlp.exe')).rejects.toMatchObject({
      problem: 'offline'
    })
    const odd = http({
      getJson: vi.fn(async () => ({})),
      redirectTarget: vi.fn(async () => 'https://github.com/yt-dlp/yt-dlp/releases')
    })
    await expect(queryLatest(odd, 'yt-dlp.exe')).rejects.toMatchObject({
      problem: 'server'
    })
    const thrown = http({
      getJson: vi.fn(async () => {
        throw 'text'
      })
    })
    await expect(queryLatest(thrown, 'yt-dlp.exe')).rejects.toThrow('text')
  })
})

describe('fetchSignedSums', () => {
  it('answers the checksums only when their signature checks out', async () => {
    const net = http({
      getBuffer: vi.fn(async (url: string) => (url.endsWith('.sig') ? SIGNATURE : SUMS))
    })
    await expect(
      fetchSignedSums(net, '2026.08.19', verifyDetachedSignature)
    ).resolves.toBe(SUMS.toString('utf8'))
    expect(net.getBuffer).toHaveBeenCalledWith(
      'https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/SHA2-256SUMS',
      65536
    )
    expect(net.getBuffer).toHaveBeenCalledWith(
      'https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/SHA2-256SUMS.sig',
      16384
    )

    const swapped = http({
      getBuffer: vi.fn(async (url: string) =>
        url.endsWith('.sig') ? SIGNATURE : Buffer.concat([SUMS, Buffer.from('x')])
      )
    })
    await expect(
      fetchSignedSums(swapped, '2026.08.19', verifyDetachedSignature)
    ).rejects.toMatchObject({ problem: 'signature' })
  })

  it('reads a failed fetch by its cause', async () => {
    const missing = http({
      getBuffer: vi.fn(async () => {
        throw new HttpStatusError('sums', 404)
      })
    })
    await expect(
      fetchSignedSums(missing, '2026.08.19', verifyDetachedSignature)
    ).rejects.toMatchObject({ problem: 'server' })
    const odd = http({
      getBuffer: vi.fn(async () => {
        throw 7
      })
    })
    await expect(
      fetchSignedSums(odd, '2026.08.19', verifyDetachedSignature)
    ).rejects.toMatchObject({ problem: 'unknown' })
  })
})

describe('problemOf', () => {
  it('reads every failure as one problem', () => {
    expect(problemOf(new YtdlpUpdateError('checksum', 'x'))).toBe('checksum')
    expect(problemOf(new HttpStatusError('u', 403))).toBe('rate-limited')
    expect(problemOf(new HttpStatusError('u', 429))).toBe('rate-limited')
    expect(problemOf(new HttpStatusError('u', 500))).toBe('server')
    expect(problemOf(new TooLargeError('u', 1))).toBe('server')
    expect(problemOf(new RefusedUrlError('u'))).toBe('server')
    expect(problemOf(new SyntaxError('JSON'))).toBe('server')
    expect(problemOf(Object.assign(new Error('x'), { code: 'ECONNRESET' }))).toBe(
      'offline'
    )
    expect(problemOf(Object.assign(new Error('x'), { code: 'ETIMEDOUT' }))).toBe(
      'offline'
    )
    expect(problemOf(Object.assign(new Error('x'), { code: 'ENOSPC' }))).toBe('disk')
    expect(problemOf(Object.assign(new Error('x'), { code: 'EWHAT' }))).toBe('unknown')
    expect(problemOf(new Error('x'))).toBe('unknown')
    expect(problemOf(null)).toBe('unknown')
  })
})
