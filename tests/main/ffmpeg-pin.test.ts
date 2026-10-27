import { describe, expect, it } from 'vitest'
import pinJson from '@main/binaries/ffmpeg/pinned-builds.json'
import {
  buildVersion,
  foldersToDelete,
  isPinId,
  parsePin,
  pinKey,
  pinnedFolders,
  planInstall,
  publisherOf,
  type PinnedBuilds
} from '@main/binaries/ffmpeg/pin'

const SHA = 'a'.repeat(64)

function asset(build: string, url: string, contains: Array<'ffmpeg' | 'ffprobe'>) {
  return { build, url, bytes: 10, sha256: SHA, kind: 'zip', contains }
}

function pin(platforms: Record<string, unknown>, version = '9.0.2'): unknown {
  return { id: `${version}-2026-09-30`, version, fetched: '2026-10-27', platforms }
}

const PRIMARY = asset('btbn-n9.0.2-17-g2a571b6068', 'https://github.com/p.zip', [
  'ffmpeg',
  'ffprobe'
])
const FALLBACK = asset('gyan-9.0.2-full', 'https://github.com/f.zip', [
  'ffmpeg',
  'ffprobe'
])

describe('the shipped pin', () => {
  it('parses, and pins a build of both tools for every platform the app ships', () => {
    const parsed = parsePin(pinJson)
    for (const key of ['win32-x64', 'darwin-arm64', 'linux-x64']) {
      const entry = parsed.platforms[key]
      expect(entry, key).toBeDefined()
      expect(entry.primary.length, key).toBeGreaterThan(0)
      expect(new Set(entry.primary.flatMap((a) => a.contains)), key).toEqual(
        new Set(['ffmpeg', 'ffprobe'])
      )
    }
  })

  it('downloads only over HTTPS from the hosts the transport allows', () => {
    const parsed = parsePin(pinJson)
    for (const entry of Object.values(parsed.platforms)) {
      for (const a of [...entry.primary, ...entry.fallback]) {
        expect(a.url).toMatch(
          /^https:\/\/(github\.com\/(BtbN\/FFmpeg-Builds|GyanD\/codexffmpeg)\/releases\/download\/|ffmpeg\.martin-riedl\.de\/download\/)/
        )
      }
    }
  })
})

describe('parsePin', () => {
  it('reads a platform version override and defaults the rest to the pin version', () => {
    const parsed = parsePin(
      pin({
        'win32-x64': { primary: [PRIMARY], fallback: [FALLBACK] },
        'darwin-arm64': {
          version: '7.1.1',
          primary: [
            asset('mriedl-7.1.1', 'https://ffmpeg.martin-riedl.de/a.zip', ['ffmpeg']),
            asset('mriedl-7.1.1', 'https://ffmpeg.martin-riedl.de/b.zip', ['ffprobe'])
          ],
          fallback: []
        }
      })
    )
    expect(parsed.platforms['win32-x64'].version).toBe('9.0.2')
    expect(parsed.platforms['darwin-arm64'].version).toBe('7.1.1')
  })

  it('rejects anything the installer could misuse', () => {
    const cases: unknown[] = [
      null,
      { id: 'x', version: '9.0.2', fetched: 'today' },
      pin({ k: { primary: [{ ...PRIMARY, sha256: 'xyz' }], fallback: [] } }),
      pin({
        k: { primary: [{ ...PRIMARY, url: 'http://github.com/p.zip' }], fallback: [] }
      }),
      pin({ k: { primary: [{ ...PRIMARY, bytes: 0 }], fallback: [] } }),
      pin({ k: { primary: [{ ...PRIMARY, kind: 'rar' }], fallback: [] } }),
      pin({ k: { primary: [{ ...PRIMARY, build: 'my-build' }], fallback: [] } }),
      pin({ k: { primary: [{ ...PRIMARY, contains: ['ffmpeg'] }], fallback: [] } }),
      pin({
        k: { primary: [PRIMARY, { ...FALLBACK, contains: ['ffprobe'] }], fallback: [] }
      }),
      pin({ k: { primary: [PRIMARY], fallback: 'none' } }),
      pin({ k: { version: 9, primary: [PRIMARY], fallback: [] } }),
      pin({ k: { primary: [PRIMARY], fallback: [] } }, '9.0.3')
    ]
    for (const value of cases) {
      expect(() => parsePin(value), JSON.stringify(value)).toThrow()
    }
  })
})

describe('build folder names', () => {
  it('reads the version and publisher of every name the app creates, and nothing else', () => {
    expect(buildVersion('btbn-n9.0.2-17-g2a571b6068')).toBe('9.0.2')
    expect(buildVersion('gyan-9.0.2-full')).toBe('9.0.2')
    expect(buildVersion('mriedl-7.1.1')).toBe('7.1.1')
    expect(buildVersion('legacy')).toBeNull()
    expect(isPinId('btbn-n9.0.2-17-g2a571b6068.part-abc')).toBe(false)
    expect(publisherOf('btbn-n9.0.2-17-g2a571b6068')).toBe('BtbN FFmpeg Builds')
    expect(publisherOf('gyan-9.0.2-full')).toBe('Gyan.dev')
    expect(publisherOf('mriedl-9.0.2')).toBe('Martin Riedl')
    expect(publisherOf('other')).toBeNull()
    expect(pinKey('win32', 'x64')).toBe('win32-x64')
  })
})

describe('planInstall', () => {
  const parsed: PinnedBuilds = parsePin(
    pin({ 'win32-x64': { primary: [PRIMARY], fallback: [FALLBACK] } })
  )

  it('reuses an installed build of the pin, primary or fallback', () => {
    expect(planInstall(parsed, 'win32-x64', [PRIMARY.build], [])).toEqual({
      kind: 'reuse',
      folder: PRIMARY.build
    })
    expect(planInstall(parsed, 'win32-x64', ['mriedl-8.0', FALLBACK.build], [])).toEqual({
      kind: 'reuse',
      folder: FALLBACK.build
    })
  })

  it('downloads the primary, falls back only once it is gone, then gives up', () => {
    expect(planInstall(parsed, 'win32-x64', [], [])).toMatchObject({
      kind: 'download',
      source: 'primary'
    })
    expect(
      planInstall(parsed, 'win32-x64', [], [{ url: PRIMARY.url, status: 503 }])
    ).toMatchObject({ kind: 'download', source: 'primary' })
    expect(
      planInstall(parsed, 'win32-x64', [], [{ url: PRIMARY.url, status: 404 }])
    ).toMatchObject({ kind: 'download', source: 'fallback' })
    expect(
      planInstall(
        parsed,
        'win32-x64',
        [],
        [
          { url: PRIMARY.url, status: 410 },
          { url: FALLBACK.url, status: 404 }
        ]
      )
    ).toEqual({ kind: 'unavailable' })
    expect(planInstall(parsed, 'linux-riscv64', [], [])).toEqual({ kind: 'unavailable' })
  })

  it('names the pinned folders, primary first', () => {
    expect(pinnedFolders(parsed, 'win32-x64')).toEqual([PRIMARY.build, FALLBACK.build])
    expect(pinnedFolders(parsed, 'linux-riscv64')).toEqual([])
  })
})

describe('foldersToDelete', () => {
  it('deletes other pinned builds and interrupted installs, never anything else', () => {
    const entries = [
      'btbn-n9.0.2-17-g2a571b6068',
      'btbn-n8.0-1-gabc',
      'gyan-8.0-full',
      'btbn-n9.0.2-17-g2a571b6068.part-a1b2c3',
      'notes',
      'custom.part-zz'
    ]
    expect(foldersToDelete(['btbn-n9.0.2-17-g2a571b6068'], entries)).toEqual([
      'btbn-n8.0-1-gabc',
      'gyan-8.0-full',
      'btbn-n9.0.2-17-g2a571b6068.part-a1b2c3'
    ])
  })
})
