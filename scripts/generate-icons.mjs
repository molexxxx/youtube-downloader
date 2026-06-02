import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const D = 1024
const RADIUS = 232
const TILE_TOP = [0xff, 0x47, 0x57]
const TILE_BOTTOM = [0xe0, 0x16, 0x2b]
const TRI = { ax: 349, ay: 305, bx: 675, by: 305, cx: 512, cy: 552 }
const BAR = { x: 349, y: 676, w: 326, h: 58, r: 29 }

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function inRoundedRect(x, y, rx, ry, rw, rh, radius) {
  if (x < rx || x > rx + rw || y < ry || y > ry + rh) return false
  const minX = rx + radius
  const maxX = rx + rw - radius
  const minY = ry + radius
  const maxY = ry + rh - radius
  const dx = x < minX ? minX - x : x > maxX ? x - maxX : 0
  const dy = y < minY ? minY - y : y > maxY ? y - maxY : 0
  return dx * dx + dy * dy <= radius * radius
}

function inTriangle(x, y) {
  const sign = (x1, y1, x2, y2) => (x - x2) * (y1 - y2) - (x1 - x2) * (y - y2)
  const d1 = sign(TRI.ax, TRI.ay, TRI.bx, TRI.by)
  const d2 = sign(TRI.bx, TRI.by, TRI.cx, TRI.cy)
  const d3 = sign(TRI.cx, TRI.cy, TRI.ax, TRI.ay)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

function render(size) {
  const buf = Buffer.alloc(size * size * 4) // transparent
  const SS = 4
  const scale = D / size
  const total = SS * SS

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let nTile = 0
      let nGlyph = 0
      let gradAccum = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const dx = (px + (sx + 0.5) / SS) * scale
          const dy = (py + (sy + 0.5) / SS) * scale
          if (!inRoundedRect(dx, dy, 0, 0, D, D, RADIUS)) continue
          nTile++
          gradAccum += dy / D
          const glyph =
            inTriangle(dx, dy) ||
            inRoundedRect(dx, dy, BAR.x, BAR.y, BAR.w, BAR.h, BAR.r)
          if (glyph) nGlyph++
        }
      }
      if (nTile === 0) continue
      const i = (py * size + px) * 4
      const nRed = nTile - nGlyph
      const t = gradAccum / nTile
      const tile = [
        TILE_TOP[0] + (TILE_BOTTOM[0] - TILE_TOP[0]) * t,
        TILE_TOP[1] + (TILE_BOTTOM[1] - TILE_TOP[1]) * t,
        TILE_TOP[2] + (TILE_BOTTOM[2] - TILE_TOP[2]) * t
      ]
      buf[i] = Math.round((tile[0] * nRed + 255 * nGlyph) / nTile)
      buf[i + 1] = Math.round((tile[1] * nRed + 255 * nGlyph) / nTile)
      buf[i + 2] = Math.round((tile[2] * nRed + 255 * nGlyph) / nTile)
      buf[i + 3] = Math.round((nTile / total) * 255)
    }
  }
  return encodePng(size, size, buf)
}

mkdirSync(join(root, 'build'), { recursive: true })

writeFileSync(join(root, 'build', 'icon.png'), render(1024))

mkdirSync(join(root, 'resources'), { recursive: true })
writeFileSync(join(root, 'resources', 'icon.png'), render(512))

const tray = render(32)
writeFileSync(join(root, 'build', 'tray.png'), tray)
writeFileSync(
  join(root, 'src', 'main', 'tray-icon.json'),
  JSON.stringify({ dataUrl: `data:image/png;base64,${tray.toString('base64')}` })
)

console.log(
  'Generated build/icon.png (1024), resources/icon.png (512), build/tray.png (32), src/main/tray-icon.json'
)
