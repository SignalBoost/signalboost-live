// saas/tests/cosPdfTextExtract.node.test.ts
//
// The extractor is exercised against PDFs CONSTRUCTED IN THE TEST — real minimal documents with
// real content streams (both plain and FlateDecode-compressed via the same zlib that production
// uses), not fixtures on disk and not mocks of the extractor. The honesty gates matter as much as
// the happy path: encrypted, image-only, and undecodable documents must refuse with their exact
// reason, because a confident garbage extraction would poison learning-corpus admission scoring.

import assert from 'node:assert/strict'
import test from 'node:test'
import { deflateSync } from 'node:zlib'
import {
  MAX_PDF_BYTES,
  extractPdfText,
  pdfExtractionFailureMessage,
} from '../lib/ai/cos/pdfTextExtract.ts'

function pdfWithStream(streamBody: Buffer, options: { flate?: boolean; extraHeader?: string } = {}): Buffer {
  const data = options.flate ? deflateSync(streamBody) : streamBody
  const filter = options.flate ? '/Filter /FlateDecode ' : ''
  const parts = [
    '%PDF-1.4\n',
    options.extraHeader || '',
    `1 0 obj << ${filter}/Length ${data.length} >>\nstream\n`,
  ]
  return Buffer.concat([
    Buffer.from(parts.join(''), 'latin1'),
    data,
    Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1'),
  ])
}

const CONTENT = Buffer.from(
  'BT /F1 12 Tf 72 700 Td (Transformer attention mechanisms compute weighted combinations.) Tj T* (Multi-head attention lets each head learn a projection.) Tj ET',
  'latin1',
)

test('plain text-operator streams extract their sentences with line structure', () => {
  const result = extractPdfText(pdfWithStream(CONTENT))
  assert.equal(result.ok, true)
  assert.match(result.text, /Transformer attention mechanisms compute weighted combinations\./)
  assert.match(result.text, /Multi-head attention lets each head learn a projection\./)
  assert.ok(result.text.includes('\n'))
})

test('FlateDecode streams inflate and extract identically', () => {
  const result = extractPdfText(pdfWithStream(CONTENT, { flate: true }))
  assert.equal(result.ok, true)
  assert.match(result.text, /Transformer attention mechanisms/)
})

test('TJ arrays, escapes, and hex strings are all read', () => {
  const body = Buffer.from(
    'BT [(Kerned ) -120 (array ) -80 (text about attention mechanisms and weighted projections)] TJ ' +
    '(Escaped \\(parenthetical\\) content with a colon\\072 done) Tj ' +
    '<48657820656e636f64656420617474656e74696f6e207061737361676520646563;6f646564> Tj ET',
    'latin1',
  )
  const result = extractPdfText(pdfWithStream(body))
  assert.equal(result.ok, true)
  assert.match(result.text, /Kerned array text about attention mechanisms/)
  assert.match(result.text, /Escaped \(parenthetical\) content with a colon: done/)
  assert.match(result.text, /Hex encoded attention passage dec/)
})

test('UTF-16BE strings decode through their BOM', () => {
  const utf16 = Buffer.concat([
    Buffer.from([0xfe, 0xff]),
    Buffer.from('Attention studies continue across many languages today', 'utf16le').swap16(),
  ])
  const body = Buffer.concat([
    Buffer.from('BT (', 'latin1'),
    // escape the bytes that would break the literal string
    Buffer.from(utf16.toString('latin1').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'), 'latin1'),
    Buffer.from(') Tj ET', 'latin1'),
  ])
  const result = extractPdfText(pdfWithStream(body))
  assert.equal(result.ok, true)
  assert.match(result.text, /Attention studies continue across many languages today/)
})

test('a non-PDF refuses as not_a_pdf', () => {
  const result = extractPdfText(Buffer.from('just some text file content, definitely not a pdf'))
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'not_a_pdf')
})

test('an encrypted document refuses as encrypted rather than emitting ciphertext', () => {
  const result = extractPdfText(pdfWithStream(CONTENT, { extraHeader: 'trailer << /Encrypt 5 0 R >>\n' }))
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'encrypted')
})

test('an image-only document refuses as no_text_content — no OCR is pretended', () => {
  const imageOnly = Buffer.from('%PDF-1.4\n1 0 obj << /Subtype /Image >> endobj\n%%EOF\n', 'latin1')
  const result = extractPdfText(imageOnly)
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'no_text_content')
})

test('byte-soup subset-font output is refused as undecodable, never fed to the corpus', () => {
  const soup = Buffer.from(
    'BT (' + Array.from({ length: 600 }, (_, index) => String.fromCharCode(1 + (index % 25))).join('') + ') Tj ET',
    'latin1',
  )
  const result = extractPdfText(pdfWithStream(soup))
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'undecodable_text')
})

test('oversized buffers refuse before any parsing', () => {
  const huge = Buffer.alloc(MAX_PDF_BYTES + 1, 0x25)
  assert.equal(extractPdfText(huge).reason, 'too_large')
})

test('every failure class has an owner-facing explanation naming the paste fallback where it applies', () => {
  for (const reason of ['too_large', 'not_a_pdf', 'encrypted', 'no_text_content', 'undecodable_text'] as const) {
    const message = pdfExtractionFailureMessage(reason)
    assert.ok(message.length > 20, reason)
  }
  assert.match(pdfExtractionFailureMessage('no_text_content'), /paste the text/)
  assert.match(pdfExtractionFailureMessage('undecodable_text'), /paste/)
})
