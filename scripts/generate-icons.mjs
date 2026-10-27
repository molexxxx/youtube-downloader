import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Design grid: every shape below is in units of a 1024 x 1024 tile. */
const D = 1024
const RADIUS = 232
const RED = [0xd2, 0x2f, 0x24]
const BLUE = [0x4a, 0x4f, 0xd6]
const WHITE = [0xff, 0xff, 0xff]

/** The download glyph: a play triangle turned down onto a baseline. */
const TRI = { ax: 349, ay: 305, bx: 675, by: 305, cx: 512, cy: 552 }
const BAR = { x: 349, y: 676, w: 326, h: 58, r: 29 }
const GLYPH_PATH =
  'M349 305 h326 a28 28 0 0 1 24 43 l-163 247 a28 28 0 0 1 -48 0 l-163 -247 a28 28 0 0 1 24 -43 z'

/**
 * The Discord bot badge in the tile's bottom-right corner: a blue disc with a
 * bot head, cut out of the tile by a transparent gap so it reads on any
 * background. Sized to clear the baseline bar by about 15 units.
 */
const BADGE = { cx: 844, cy: 844, r: 160, gap: 26 }
const BOT_SCALE = BADGE.r / 15.5
const bot = (x, y) => [BADGE.cx + (x - 15) * BOT_SCALE, BADGE.cy + (y - 15) * BOT_SCALE]
const [HEAD_X, HEAD_Y] = bot(8.2, 10.6)
const HEAD = {
  x: HEAD_X,
  y: HEAD_Y,
  w: 13.6 * BOT_SCALE,
  h: 10.4 * BOT_SCALE,
  r: 3 * BOT_SCALE
}
const [STEM_X, STEM_TOP] = bot(15, 8.2)
const STEM = {
  x: STEM_X - 0.8 * BOT_SCALE,
  y: STEM_TOP,
  w: 1.6 * BOT_SCALE,
  h: 2.6 * BOT_SCALE
}
const [BALL_X, BALL_Y] = bot(15, 7.4)
const BALL = { cx: BALL_X, cy: BALL_Y, r: 1.3 * BOT_SCALE }
const EYES = [bot(12, 15.8), bot(18, 15.8)].map(([cx, cy]) => ({
  cx,
  cy,
  r: 1.5 * BOT_SCALE
}))

/** Apple's macOS icon grid: the tile is 824 of 1024 units, inset by 100. */
const MAC_INSET = 100

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

function inCircle(x, y, c, r) {
  const dx = x - c.cx
  const dy = y - c.cy
  return dx * dx + dy * dy <= r * r
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

/** The color at a point of the 1024-unit design, or null where it is transparent. */
function sample(x, y, badge) {
  if (badge) {
    if (inCircle(x, y, BADGE, BADGE.r)) {
      if (EYES.some((eye) => inCircle(x, y, eye, eye.r))) return BLUE
      const isBot =
        inRoundedRect(x, y, HEAD.x, HEAD.y, HEAD.w, HEAD.h, HEAD.r) ||
        inRoundedRect(x, y, STEM.x, STEM.y, STEM.w, STEM.h, 0) ||
        inCircle(x, y, BALL, BALL.r)
      return isBot ? WHITE : BLUE
    }
    if (inCircle(x, y, BADGE, BADGE.r + BADGE.gap)) return null
  }
  if (!inRoundedRect(x, y, 0, 0, D, D, RADIUS)) return null
  const glyph = inTriangle(x, y) || inRoundedRect(x, y, BAR.x, BAR.y, BAR.w, BAR.h, BAR.r)
  return glyph ? WHITE : RED
}

/**
 * Rasterize the icon at `size` pixels with 4x4 supersampling. `inset` shrinks
 * the tile inside the canvas (in 1024 units, for the macOS grid).
 */
function render(size, { badge = true, inset = 0 } = {}) {
  const buf = Buffer.alloc(size * size * 4)
  const SS = 4
  const total = SS * SS
  const canvasScale = D / size
  const designScale = D / (D - 2 * inset)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let covered = 0
      const sum = [0, 0, 0]
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const cx = (px + (sx + 0.5) / SS) * canvasScale
          const cy = (py + (sy + 0.5) / SS) * canvasScale
          const color = sample(
            (cx - inset) * designScale,
            (cy - inset) * designScale,
            badge
          )
          if (!color) continue
          covered++
          sum[0] += color[0]
          sum[1] += color[1]
          sum[2] += color[2]
        }
      }
      if (covered === 0) continue
      const i = (py * size + px) * 4
      buf[i] = Math.round(sum[0] / covered)
      buf[i + 1] = Math.round(sum[1] / covered)
      buf[i + 2] = Math.round(sum[2] / covered)
      buf[i + 3] = Math.round((covered / total) * 255)
    }
  }
  return encodePng(size, size, buf)
}

const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
const n = (v) => Number(v.toFixed(2))

/** The same icon as an SVG, the badge's gap cut from the tile with a mask. */
function svg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${D}" height="${D}" viewBox="0 0 ${D} ${D}" role="img" aria-label="YouTube Downloader">
  <defs>
    <mask id="badge-gap">
      <rect width="${D}" height="${D}" fill="#fff"/>
      <circle cx="${BADGE.cx}" cy="${BADGE.cy}" r="${BADGE.r + BADGE.gap}" fill="#000"/>
    </mask>
  </defs>
  <g mask="url(#badge-gap)">
    <rect width="${D}" height="${D}" rx="${RADIUS}" fill="${hex(RED)}"/>
    <path d="${GLYPH_PATH}" fill="#fff"/>
    <rect x="${BAR.x}" y="${BAR.y}" width="${BAR.w}" height="${BAR.h}" rx="${BAR.r}" fill="#fff"/>
  </g>
  <circle cx="${BADGE.cx}" cy="${BADGE.cy}" r="${BADGE.r}" fill="${hex(BLUE)}"/>
  <rect x="${n(STEM.x)}" y="${n(STEM.y)}" width="${n(STEM.w)}" height="${n(STEM.h)}" fill="#fff"/>
  <circle cx="${n(BALL.cx)}" cy="${n(BALL.cy)}" r="${n(BALL.r)}" fill="#fff"/>
  <rect x="${n(HEAD.x)}" y="${n(HEAD.y)}" width="${n(HEAD.w)}" height="${n(HEAD.h)}" rx="${n(HEAD.r)}" fill="#fff"/>
${EYES.map((e) => `  <circle cx="${n(e.cx)}" cy="${n(e.cy)}" r="${n(e.r)}" fill="${hex(BLUE)}"/>`).join('\n')}
</svg>
`
}

mkdirSync(join(root, 'build'), { recursive: true })
mkdirSync(join(root, 'resources'), { recursive: true })

writeFileSync(join(root, 'build', 'icon.png'), render(1024))
writeFileSync(join(root, 'build', 'icon-mac.png'), render(1024, { inset: MAC_INSET }))
writeFileSync(join(root, 'resources', 'icon.png'), render(512))
writeFileSync(join(root, 'build', 'icon.svg'), svg())
writeFileSync(join(root, '.github', 'assets', 'icon.svg'), svg())

const tray = render(32, { badge: false })
writeFileSync(join(root, 'build', 'tray.png'), tray)
writeFileSync(
  join(root, 'src', 'main', 'tray-icon.json'),
  JSON.stringify({ dataUrl: `data:image/png;base64,${tray.toString('base64')}` })
)

console.log(
  'Generated build/icon.png (1024), build/icon-mac.png (1024, macOS grid), resources/icon.png (512), build/icon.svg, .github/assets/icon.svg, build/tray.png (32, no badge), src/main/tray-icon.json'
)
