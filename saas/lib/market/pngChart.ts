// saas/lib/market/pngChart.ts
//
// Dependency-free PNG line chart. The Concierge displays only png/jpeg/webp data URLs (SVG is
// refused as an XSS vector), and the serverless runtime has no guaranteed system fonts, so the
// chart is rasterised here with node:zlib and an embedded 5x7 bitmap font. Deterministic output:
// the same series always produces the same bytes.

import { deflateSync } from 'node:zlib'

export type ChartPoint = { date: string; value: number }
export type LineChartSpec = {
  title: string
  subtitle?: string
  points: ChartPoint[]
  valuePrefix?: string
  width?: number
  height?: number
}

type Rgb = readonly [number, number, number]
const WHITE: Rgb = [255, 255, 255]
const INK: Rgb = [33, 37, 41]
const MUTED: Rgb = [108, 117, 125]
const GRID: Rgb = [226, 230, 234]
const LINE: Rgb = [37, 99, 235]
const FILL: Rgb = [219, 234, 254]

// 5x7 glyphs, one string per row, '#' = ink. Upper-case only; lower-case input is upper-cased.
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '..#..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '$': ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
}

class Canvas {
  readonly pixels: Uint8Array
  readonly width: number
  readonly height: number
  constructor(width: number, height: number, background: Rgb) {
    this.width = width
    this.height = height
    this.pixels = new Uint8Array(width * height * 3)
    for (let index = 0; index < width * height; index += 1) this.pixels.set(background, index * 3)
  }

  set(x: number, y: number, color: Rgb) {
    const px = Math.round(x)
    const py = Math.round(y)
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return
    this.pixels.set(color, (py * this.width + px) * 3)
  }

  rect(x: number, y: number, w: number, h: number, color: Rgb) {
    for (let dy = 0; dy < h; dy += 1) for (let dx = 0; dx < w; dx += 1) this.set(x + dx, y + dy, color)
  }

  line(x0: number, y0: number, x1: number, y1: number, color: Rgb, thickness = 1) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))))
    const half = Math.floor(thickness / 2)
    for (let step = 0; step <= steps; step += 1) {
      const x = x0 + ((x1 - x0) * step) / steps
      const y = y0 + ((y1 - y0) * step) / steps
      this.rect(Math.round(x) - half, Math.round(y) - half, thickness, thickness, color)
    }
  }

  text(value: string, x: number, y: number, color: Rgb, scale = 2) {
    let cursor = x
    for (const char of String(value).toUpperCase()) {
      const glyph = GLYPHS[char] || GLYPHS[' ']
      for (let row = 0; row < 7; row += 1) {
        for (let col = 0; col < 5; col += 1) if (glyph[row][col] === '#') this.rect(cursor + col * scale, y + row * scale, scale, scale, color)
      }
      cursor += 6 * scale
    }
  }
}

export function textWidth(value: string, scale = 2): number {
  return Math.max(0, String(value).length * 6 * scale - scale)
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

export function encodePng(canvas: Canvas): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(canvas.width, 0)
  header.writeUInt32BE(canvas.height, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // truecolour RGB
  const stride = canvas.width * 3
  const raw = Buffer.alloc((stride + 1) * canvas.height)
  for (let y = 0; y < canvas.height; y += 1) {
    raw[y * (stride + 1)] = 0
    Buffer.from(canvas.pixels.buffer, canvas.pixels.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array()),
  ])
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function niceStep(range: number, targetTicks: number): number {
  const raw = range / Math.max(1, targetTicks)
  const power = 10 ** Math.floor(Math.log10(raw || 1))
  const scaled = raw / power
  return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10) * power
}

function formatValue(value: number, step: number, prefix: string): string {
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2
  return `${prefix}${value.toFixed(decimals)}`
}

/** Render a daily line chart as PNG bytes. Points must be in chronological order. */
export function renderLineChartPng(spec: LineChartSpec): Buffer {
  const width = spec.width ?? 960
  const height = spec.height ?? 540
  const prefix = spec.valuePrefix ?? ''
  const points = spec.points.filter(point => Number.isFinite(point.value))
  if (points.length < 2) throw new Error('chart_requires_two_points')

  const canvas = new Canvas(width, height, WHITE)
  canvas.text(spec.title, 32, 24, INK, 3)
  if (spec.subtitle) canvas.text(spec.subtitle, 32, 58, MUTED, 2)

  const values = points.map(point => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const padding = (max - min || Math.abs(max) || 1) * 0.08
  const step = niceStep(max - min + padding * 2, 5)
  const low = Math.floor((min - padding) / step) * step
  const high = Math.ceil((max + padding) / step) * step

  const left = 32 + textWidth(formatValue(high, step, prefix)) + 16
  const right = width - 32
  const top = 96
  const bottom = height - 56
  const xAt = (index: number) => left + ((right - left) * index) / (points.length - 1)
  const yAt = (value: number) => bottom - ((bottom - top) * (value - low)) / (high - low || 1)

  for (let tick = low; tick <= high + step / 2; tick += step) {
    const y = Math.round(yAt(tick))
    canvas.line(left, y, right, y, GRID)
    const label = formatValue(tick, step, prefix)
    canvas.text(label, left - 12 - textWidth(label), y - 7, MUTED, 2)
  }

  // Area under the line, then the line, then month ticks along the x axis.
  for (let index = 0; index < points.length - 1; index += 1) {
    const x0 = xAt(index)
    const x1 = xAt(index + 1)
    for (let x = Math.ceil(x0); x <= x1; x += 1) {
      const t = (x - x0) / (x1 - x0 || 1)
      const y = yAt(points[index].value + (points[index + 1].value - points[index].value) * t)
      canvas.line(x, y, x, bottom - 1, FILL)
    }
  }
  canvas.line(left, bottom, right, bottom, MUTED)
  for (let index = 0; index < points.length - 1; index += 1) {
    canvas.line(xAt(index), yAt(points[index].value), xAt(index + 1), yAt(points[index + 1].value), LINE, 3)
  }
  const last = points[points.length - 1]
  canvas.rect(Math.round(xAt(points.length - 1)) - 4, Math.round(yAt(last.value)) - 4, 9, 9, LINE)

  let lastLabelEnd = -Infinity
  for (let index = 0; index < points.length; index += 1) {
    const month = points[index].date.slice(0, 7)
    // The first point is usually mid-month; label only full month starts.
    if (index === 0 || points[index - 1].date.slice(0, 7) === month) continue
    const x = Math.round(xAt(index))
    canvas.line(x, bottom, x, bottom + 6, MUTED)
    const label = `${MONTHS[Number(month.slice(5, 7)) - 1] || ''} ${month.slice(2, 4)}`
    const start = Math.max(left, Math.min(right - textWidth(label), x - textWidth(label) / 2))
    if (start <= lastLabelEnd + 12) continue
    canvas.text(label, start, bottom + 14, MUTED, 2)
    lastLabelEnd = start + textWidth(label)
  }

  return encodePng(canvas)
}
