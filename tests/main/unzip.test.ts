import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { extractZip } from '@main/binaries/ffmpeg/unzip'

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

interface ZipEntry {
  name: string
  content?: string
  /** Full unix st_mode; the high bits select the entry type. */
  mode?: number
}

/**
 * Builds an uncompressed zip archive in memory so tests can express entry
 * types (symlink, fifo) that no zip-writing library will emit on demand.
 */
function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const data = Buffer.from(entry.content ?? '', 'utf8')
    const crc = crc32(data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    // version made by: unix (3) in the high byte
    central.writeUInt16LE((3 << 8) | 20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(((entry.mode ?? 0o100644) << 16) >>> 0, 38)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)

    offset += 30 + name.length + data.length
  }

  const centralBuf = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16)

  return Buffer.concat([...locals, centralBuf, end])
}

describe('extractZip', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'molex-unzip-test-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  async function extract(entries: ZipEntry[]): Promise<string> {
    const zipPath = path.join(dir, 'archive.zip')
    const dest = path.join(dir, 'out')
    fs.writeFileSync(zipPath, buildZip(entries))
    fs.mkdirSync(dest, { recursive: true })
    await extractZip(zipPath, dest)
    return dest
  }

  it('extracts nested files and creates missing directories', async () => {
    const dest = await extract([
      { name: 'ffmpeg-build/', mode: 0o040755 },
      { name: 'ffmpeg-build/bin/ffmpeg', content: 'binary', mode: 0o100755 },
      { name: 'ffmpeg-build/README', content: 'notes' }
    ])

    expect(fs.readFileSync(path.join(dest, 'ffmpeg-build/bin/ffmpeg'), 'utf8')).toBe(
      'binary'
    )
    expect(fs.readFileSync(path.join(dest, 'ffmpeg-build/README'), 'utf8')).toBe('notes')
  })

  it('writes only the files the filter wants, by base name', async () => {
    const zipPath = path.join(dir, 'archive.zip')
    const dest = path.join(dir, 'out')
    fs.writeFileSync(
      zipPath,
      buildZip([
        { name: 'ffmpeg-n9/', mode: 0o040755 },
        { name: 'ffmpeg-n9/bin/ffmpeg.exe', content: 'ffmpeg' },
        { name: 'ffmpeg-n9\\bin\\ffprobe.exe', content: 'ffprobe' },
        { name: 'ffmpeg-n9/bin/ffplay.exe', content: 'ffplay' },
        { name: 'ffmpeg-n9/doc/ffmpeg.html', content: 'docs' }
      ])
    )
    fs.mkdirSync(dest, { recursive: true })
    await extractZip(
      zipPath,
      dest,
      (name) => name === 'ffmpeg.exe' || name === 'ffprobe.exe'
    )

    expect(fs.readFileSync(path.join(dest, 'ffmpeg-n9/bin/ffmpeg.exe'), 'utf8')).toBe(
      'ffmpeg'
    )
    expect(fs.readFileSync(path.join(dest, 'ffmpeg-n9/bin/ffprobe.exe'), 'utf8')).toBe(
      'ffprobe'
    )
    expect(fs.existsSync(path.join(dest, 'ffmpeg-n9/bin/ffplay.exe'))).toBe(false)
    expect(fs.existsSync(path.join(dest, 'ffmpeg-n9/doc'))).toBe(false)
  })

  it('still rejects a disallowed entry the filter would skip', async () => {
    const zipPath = path.join(dir, 'archive.zip')
    const dest = path.join(dir, 'out')
    fs.writeFileSync(
      zipPath,
      buildZip([
        { name: 'ffmpeg', content: 'ok' },
        { name: '../escaped.txt', content: 'pwned' }
      ])
    )
    fs.mkdirSync(dest, { recursive: true })

    await expect(extractZip(zipPath, dest, (name) => name === 'ffmpeg')).rejects.toThrow(
      /traversal|invalid relative path/
    )
  })

  it('rejects symlink entries (GHSA-jmr9-qjv8-65gv)', async () => {
    const zipPath = path.join(dir, 'archive.zip')
    const dest = path.join(dir, 'out')
    fs.writeFileSync(
      zipPath,
      buildZip([{ name: 'link', content: '../../../../etc/passwd', mode: 0o120777 }])
    )
    fs.mkdirSync(dest, { recursive: true })

    await expect(extractZip(zipPath, dest)).rejects.toThrow(/symlink/i)
    expect(fs.existsSync(path.join(dest, 'link'))).toBe(false)
  })

  it('rejects non-regular entries such as fifos', async () => {
    const zipPath = path.join(dir, 'archive.zip')
    const dest = path.join(dir, 'out')
    fs.writeFileSync(zipPath, buildZip([{ name: 'pipe', mode: 0o010644 }]))
    fs.mkdirSync(dest, { recursive: true })

    await expect(extractZip(zipPath, dest)).rejects.toThrow(/non-regular/i)
  })

  it('rejects entries that traverse outside the destination', async () => {
    const zipPath = path.join(dir, 'archive.zip')
    const dest = path.join(dir, 'out')
    fs.writeFileSync(zipPath, buildZip([{ name: '../escaped.txt', content: 'pwned' }]))
    fs.mkdirSync(dest, { recursive: true })

    await expect(extractZip(zipPath, dest)).rejects.toThrow()
    expect(fs.existsSync(path.join(dir, 'escaped.txt'))).toBe(false)
  })

  it('rejects absolute entry paths', async () => {
    const zipPath = path.join(dir, 'archive.zip')
    const dest = path.join(dir, 'out')
    fs.writeFileSync(zipPath, buildZip([{ name: '/tmp/escaped.txt', content: 'pwned' }]))
    fs.mkdirSync(dest, { recursive: true })

    await expect(extractZip(zipPath, dest)).rejects.toThrow()
  })

  it('rejects a corrupt archive', async () => {
    const zipPath = path.join(dir, 'archive.zip')
    const dest = path.join(dir, 'out')
    fs.writeFileSync(zipPath, Buffer.from('not a zip file at all'))
    fs.mkdirSync(dest, { recursive: true })

    await expect(extractZip(zipPath, dest)).rejects.toThrow()
  })
})
