// saas/lib/ai/cos/pdfTextExtract.ts
//
// DEPENDENCY-FREE PDF TEXT EXTRACTION for owner-directed study uploads.
//
// Why no library: adding a PDF dependency means regenerating package-lock.json, which the owner's
// GitHub-web-UI workflow cannot do — a dependency here would make the feature undeployable. Node's
// built-in zlib inflates FlateDecode streams, and the PDF text operators (Tj, TJ, ', ") are a
// small, stable grammar, so a bounded extractor needs nothing external.
//
// HONEST LIMITS, stated rather than papered over: this reads digitally-authored PDFs whose text is
// stored in standard string operators — the overwhelming majority of articles, papers, and e-book
// chapter exports. It does NOT do OCR (scanned/image PDFs contain no text to extract) and does not
// interpret ToUnicode CMaps for exotic subset fonts; when decoding yields gibberish, the gibberish
// detector below reports "no readable text" instead of feeding garbage into the learning corpus —
// a wrong-but-confident extraction would poison admission scoring, which is worse than a refusal.
//
// Pure except for node:zlib; deterministic; bounded input and output.

import { inflateSync } from 'node:zlib'

export const MAX_PDF_BYTES = 8 * 1024 * 1024
export const MAX_EXTRACTED_CHARACTERS = 400_000

export type PdfExtractionResult = {
  ok: boolean
  text: string
  /** Why extraction produced nothing usable — shown to the owner verbatim. */
  reason?: 'not_a_pdf' | 'too_large' | 'encrypted' | 'no_text_content' | 'undecodable_text'
}

function isPdf(buffer: Buffer): boolean {
  return buffer.length > 8 && buffer.subarray(0, 1024).includes('%PDF-')
}

/** All decodable content streams, inflated where FlateDecode applies, plus the raw body itself. */
function contentStreams(buffer: Buffer): Buffer[] {
  const streams: Buffer[] = []
  const latin = buffer.toString('latin1')
  let cursor = 0
  for (;;) {
    const start = latin.indexOf('stream', cursor)
    if (start === -1) break
    // Stream data begins after the EOL that follows the `stream` keyword.
    let dataStart = start + 'stream'.length
    if (latin[dataStart] === '\r') dataStart += 1
    if (latin[dataStart] === '\n') dataStart += 1
    const end = latin.indexOf('endstream', dataStart)
    if (end === -1) break
    const raw = buffer.subarray(dataStart, end)
    // The dictionary immediately before the keyword tells us the filter.
    const dictStart = Math.max(0, latin.lastIndexOf('<<', start))
    const dictionary = latin.slice(dictStart, start)
    if (/\/Filter\s*(?:\[\s*)?\/FlateDecode/.test(dictionary)) {
      try {
        streams.push(inflateSync(raw))
      } catch {
        // Damaged or multiply-filtered stream — skip it rather than fail the whole document.
      }
    } else if (!/\/Filter/.test(dictionary)) {
      streams.push(raw)
    }
    cursor = end + 'endstream'.length
  }
  return streams
}

/** Decode one PDF string token's bytes: UTF-16BE when BOM'd, PDFDoc/Latin-1 otherwise. */
function decodeStringBytes(bytes: number[]): string {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = ''
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      out += String.fromCharCode((bytes[index] << 8) | bytes[index + 1])
    }
    return out
  }
  return Buffer.from(bytes).toString('latin1')
}

const OCTAL = /[0-7]/

/**
 * Pull the text-showing operator arguments out of one decoded content stream: literal strings
 * `(...)` and hex strings `<...>` that feed Tj / ' / " / TJ. TJ arrays interleave kerning numbers
 * with strings; the numbers are dropped and the strings joined.
 */
function textFromStream(stream: Buffer): string {
  const content = stream.toString('latin1')
  const pieces: string[] = []
  let index = 0
  const length = content.length

  while (index < length) {
    const char = content[index]

    if (char === '(') {
      const bytes: number[] = []
      let depth = 1
      index += 1
      while (index < length && depth > 0) {
        const current = content[index]
        if (current === '\\') {
          const next = content[index + 1]
          if (next === 'n') bytes.push(10)
          else if (next === 'r') bytes.push(13)
          else if (next === 't') bytes.push(9)
          else if (next === 'b') bytes.push(8)
          else if (next === 'f') bytes.push(12)
          else if (next === '(' || next === ')' || next === '\\') bytes.push(next.charCodeAt(0))
          else if (next === '\n' || next === '\r') { /* line continuation */ }
          else if (OCTAL.test(next)) {
            let digits = next
            let consumed = 1
            while (consumed < 3 && OCTAL.test(content[index + 1 + consumed] || '')) {
              digits += content[index + 1 + consumed]
              consumed += 1
            }
            bytes.push(parseInt(digits, 8) & 0xff)
            index += consumed - 1
          } else if (next !== undefined) bytes.push(next.charCodeAt(0))
          index += 2
          continue
        }
        if (current === '(') depth += 1
        else if (current === ')') { depth -= 1; if (depth === 0) { index += 1; break } }
        if (depth > 0) bytes.push(current.charCodeAt(0) & 0xff)
        index += 1
      }
      // Only keep it if a text-showing operator actually consumes it.
      const following = content.slice(index, index + 24)
      if (/^\s*(?:Tj|'|")/.test(following) || isInsideTJArray(content, index)) {
        pieces.push(decodeStringBytes(bytes))
        if (/^\s*(?:'|")/.test(following)) pieces.push('\n')
      }
      continue
    }

    if (char === '<' && content[index + 1] !== '<') {
      const close = content.indexOf('>', index + 1)
      if (close === -1) { index += 1; continue }
      const hex = content.slice(index + 1, close).replace(/[^0-9a-fA-F]/g, '')
      index = close + 1
      const bytes: number[] = []
      for (let h = 0; h + 1 < hex.length; h += 2) bytes.push(parseInt(hex.slice(h, h + 2), 16))
      const following = content.slice(index, index + 24)
      if (/^\s*(?:Tj|'|")/.test(following) || isInsideTJArray(content, index)) {
        pieces.push(decodeStringBytes(bytes))
      }
      continue
    }

    // Line-level structure: TD/Td/T* start a new text line — keep that as a newline so paragraph
    // chunking downstream has something to work with.
    if (char === 'T' && (content[index + 1] === 'd' || content[index + 1] === 'D' || content[index + 1] === '*')) {
      pieces.push('\n')
      index += 2
      continue
    }
    if (char === 'E' && content.slice(index, index + 2) === 'ET') {
      pieces.push('\n')
      index += 2
      continue
    }

    index += 1
  }

  return pieces.join('')
}

/** Is the string token at this position inside a `[ ... ] TJ` array? Cheap forward scan. */
function isInsideTJArray(content: string, position: number): boolean {
  const window = content.slice(position, position + 400)
  const closing = window.indexOf(']')
  if (closing === -1) return false
  return /^\s*TJ/.test(window.slice(closing + 1))
}

/**
 * Gibberish gate: subset-font PDFs without supported CMaps decode to byte soup. Feeding that into
 * the learning corpus would be worse than refusing, so extraction only counts when the result
 * looks like language: a majority of letters/digits/space among its characters.
 */
function looksLikeReadableText(text: string): boolean {
  const sample = text.slice(0, 20_000)
  // Short is not the same as undecodable: a one-paragraph PDF is legitimate. Only truly empty
  // extractions are rejected on length; everything else is judged by its readable-character ratio.
  if (sample.replace(/\s+/g, '').length < 20) return false
  let readable = 0
  let total = 0
  for (const char of sample) {
    if (/\s/.test(char)) continue
    total += 1
    if (/[\p{L}\p{N}.,;:!?'"()\-]/u.test(char)) readable += 1
  }
  return total > 0 && readable / total >= 0.85
}

/** Extract readable text from a PDF buffer, or say exactly why that is not possible. */
export function extractPdfText(buffer: Buffer): PdfExtractionResult {
  if (!buffer || buffer.length > MAX_PDF_BYTES) return { ok: false, text: '', reason: 'too_large' }
  if (!isPdf(buffer)) return { ok: false, text: '', reason: 'not_a_pdf' }
  if (buffer.subarray(0, Math.min(buffer.length, 4096)).toString('latin1').includes('/Encrypt')
    || buffer.toString('latin1').includes('/Encrypt ')) {
    return { ok: false, text: '', reason: 'encrypted' }
  }

  const streams = contentStreams(buffer)
  if (!streams.length) return { ok: false, text: '', reason: 'no_text_content' }

  const text = streams
    .map(textFromStream)
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_EXTRACTED_CHARACTERS)

  if (!text) return { ok: false, text: '', reason: 'no_text_content' }
  if (!looksLikeReadableText(text)) return { ok: false, text: '', reason: 'undecodable_text' }
  return { ok: true, text }
}

/** Owner-facing explanation for each failure class. */
export function pdfExtractionFailureMessage(reason: NonNullable<PdfExtractionResult['reason']>): string {
  switch (reason) {
    case 'too_large': return `The PDF exceeds the ${Math.floor(MAX_PDF_BYTES / (1024 * 1024))} MB upload limit. Split it or paste the relevant chapter as text.`
    case 'not_a_pdf': return 'The uploaded file is not a valid PDF.'
    case 'encrypted': return 'The PDF is encrypted or password-protected; remove the protection or paste the text.'
    case 'no_text_content': return 'No text layer was found — this is likely a scanned/image PDF. OCR is not performed; paste the text instead.'
    case 'undecodable_text': return 'The PDF stores its text with font encodings this extractor does not interpret; copy the text from a PDF viewer and paste it instead.'
  }
}
