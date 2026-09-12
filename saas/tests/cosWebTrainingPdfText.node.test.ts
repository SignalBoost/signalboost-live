// saas/tests/cosWebTrainingPdfText.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { deflateSync } from 'node:zlib'
import { pdfBufferToText, looksLikeProse } from '../lib/cos-core/layers/learning/pdfText.ts'

function buildPdf(streamBody: Buffer, filter: string | null): Buffer {
  const dict = filter ? `<< /Length ${streamBody.length} /Filter /${filter} >>` : `<< /Length ${streamBody.length} >>`
  return Buffer.concat([
    Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n4 0 obj\n' + dict + '\nstream\n', 'latin1'),
    streamBody,
    Buffer.from('\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n', 'latin1'),
  ])
}

const prose = 'Gradient descent converges under Lipschitz continuity assumptions and bounded variance. '
  + 'Stochastic variants trade estimator variance against iteration cost when training at scale. '
  + 'Calibration under distribution shift is measured separately from factual precision because '
  + 'grounding improves one without improving the other in the evaluations reported here. '
const content = Buffer.from(`BT /F1 12 Tf 50 700 Td (${prose.repeat(4)}) Tj ET`, 'latin1')

test('a flate-compressed text layer is recovered as prose', () => {
  const text = pdfBufferToText(buildPdf(deflateSync(content), 'FlateDecode'))
  assert.ok(text.includes('Lipschitz continuity'))
  assert.ok(text.length > 700)
})

test('an uncompressed text layer is recovered too', () => {
  const text = pdfBufferToText(buildPdf(content, null))
  assert.ok(text.includes('Stochastic variants'))
})

test('a document with no text layer yields nothing rather than noise', () => {
  const empty = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n', 'latin1')
  assert.equal(pdfBufferToText(empty), '')
})

test('input that is not a PDF is refused before parsing', () => {
  assert.equal(pdfBufferToText(Buffer.from('<html><body>not a pdf</body></html>')), '')
})

test('an unsupported stream filter is skipped instead of throwing', () => {
  const text = pdfBufferToText(buildPdf(Buffer.from('BT (x) Tj ET', 'latin1'), 'JPXDecode'))
  assert.equal(text, '')
})

test('mechanically extracted garbage is rejected by the prose check', () => {
  assert.equal(looksLikeProse('\u0001\u0002\u0003'.repeat(400)), false)
  assert.equal(looksLikeProse('### ### ### '.repeat(200)), false)
  assert.equal(looksLikeProse(prose.repeat(3)), true)
})

test('an oversized payload is refused rather than parsed', () => {
  assert.equal(pdfBufferToText(Buffer.alloc(4_000_001, 0x25)), '')
})
