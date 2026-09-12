// saas/lib/cos-core/layers/learning/pdfText.ts
import { inflateSync } from 'node:zlib'

/**
 * Scholarly full text on the open web is overwhelmingly PDF: arXiv, ERIC and institutional
 * repositories all serve application/pdf, and the training reader previously discarded every one
 * of them on content type. That made full-text scholarly material unreachable, which matters
 * because short metadata is ceilinged below the durable admission floor and can never be admitted.
 *
 * This is a deliberately small text-layer extractor rather than a full PDF implementation: it
 * recovers the text operators from content streams and refuses anything it cannot read cleanly.
 * Scanned documents, encrypted files and exotic font encodings yield nothing and are rejected by
 * the plausibility check rather than being passed on as noise.
 */

const TEXT_TOKEN = /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>/g
const MAX_PDF_BYTES = 4_000_000

function decodeLiteral(token: string): string {
  const body = token.slice(1, -1)
  let out = ''
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]
    if (ch !== '\\') { out += ch; continue }
    const next = body[i + 1]
    i += 1
    if (next === 'n') out += '\n'
    else if (next === 'r') out += '\r'
    else if (next === 't') out += '\t'
    else if (next === 'b' || next === 'f') out += ' '
    else if (next >= '0' && next <= '7') {
      let oct = next
      while (oct.length < 3 && body[i + 1] >= '0' && body[i + 1] <= '7') { oct += body[i + 1]; i += 1 }
      out += String.fromCharCode(parseInt(oct, 8))
    } else out += next
  }
  return out
}

function decodeHex(token: string): string {
  const hex = token.slice(1, -1).replace(/\s+/g, '')
  let out = ''
  for (let i = 0; i + 1 < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16))
  return out
}

function ascii85Decode(input: string): Buffer {
  const body = input.replace(/\s+/g, '').replace(/^<~/, '').replace(/~>$/, '')
  const out: number[] = []
  let i = 0
  while (i < body.length) {
    if (body[i] === 'z') { out.push(0, 0, 0, 0); i += 1; continue }
    const group = body.slice(i, i + 5)
    if (!group) break
    const padded = group.padEnd(5, 'u')
    let value = 0
    for (const ch of padded) value = value * 85 + (ch.charCodeAt(0) - 33)
    const quad = [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]
    out.push(...quad.slice(0, group.length - 1))
    i += 5
  }
  return Buffer.from(out)
}

function applyFilters(raw: Buffer, filters: string[]): Buffer | null {
  let data = raw
  for (const filter of filters) {
    if (filter === 'ASCII85Decode') data = ascii85Decode(data.toString('latin1'))
    else if (filter === 'FlateDecode') data = inflateSync(data)
    else return null
  }
  return data
}

/**
 * Extraction can succeed mechanically and still produce nonsense when a document uses a custom
 * font encoding, so the output is checked for language-shaped text before it is offered as
 * learning material. Garbage that reaches the corpus is worse than a source that returns nothing.
 */
export function looksLikeProse(text: string): boolean {
  if (text.length < 200) return false
  const letters = (text.match(/[A-Za-z\u00C0-\u024F]/g) || []).length
  if (letters / text.length < 0.55) return false
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length < 40) return false
  const wordy = words.filter(word => /^[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F'-]*$/.test(word)).length
  return wordy / words.length >= 0.6
}

export function pdfBufferToText(buffer: Buffer): string {
  if (!buffer.length || buffer.length > MAX_PDF_BYTES) return ''
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') return ''
  const latin = buffer.toString('latin1')
  const chunks: string[] = []
  const streamStart = /stream\r?\n?/g
  let match: RegExpExecArray | null
  while ((match = streamStart.exec(latin)) !== null) {
    const start = match.index + match[0].length
    const end = latin.indexOf('endstream', start)
    if (end < 0) break
    const header = latin.slice(Math.max(0, match.index - 400), match.index)
    const filterMatch = /\/Filter\s*(\[[^\]]*\]|\/[A-Za-z0-9]+)/.exec(header)
    const filters = filterMatch ? (filterMatch[1].match(/\/([A-Za-z0-9]+)/g) || []).map(f => f.slice(1)) : []
    try {
      const decoded = filters.length ? applyFilters(buffer.subarray(start, end), filters) : buffer.subarray(start, end)
      const text = decoded ? decoded.toString('latin1') : ''
      if (/\bTj\b|\bTJ\b|\bBT\b/.test(text)) chunks.push(text)
    } catch {
      // A stream this reader cannot decode is skipped; the remaining streams may still carry text.
    }
    streamStart.lastIndex = end
  }
  const pieces: string[] = []
  for (const chunk of chunks) {
    for (const segment of chunk.split(/\bET\b/)) {
      const tokens = segment.match(TEXT_TOKEN)
      if (!tokens) continue
      pieces.push(tokens.map(token => (token[0] === '(' ? decodeLiteral(token) : decodeHex(token))).join(''))
    }
  }
  const joined = pieces.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  return looksLikeProse(joined) ? joined : ''
}
