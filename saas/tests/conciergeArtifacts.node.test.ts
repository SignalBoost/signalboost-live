import test from 'node:test'
import assert from 'node:assert/strict'
import { detectConciergeArtifactIntent } from '../lib/artifacts/intent.ts'
import { textPdfBase64 } from '../lib/artifacts/text-pdf.ts'

test('detects explicit Concierge PDF and TXT file requests', () => {
  assert.deepEqual(detectConciergeArtifactIntent('please make a PDF named status report'), { format: 'pdf', filenameStem: 'status-report' })
  assert.deepEqual(detectConciergeArtifactIntent('I need a .txt file called notes'), { format: 'txt', filenameStem: 'notes' })
  assert.equal(detectConciergeArtifactIntent('What is a PDF?'), null)
})

test('renders a valid bounded PDF payload from text', () => {
  const bytes = Buffer.from(textPdfBase64('Hello from COS\n\nThis is a document.'), 'base64')
  assert.match(bytes.subarray(0, 8).toString('utf8'), /^%PDF-1\./)
  assert.match(bytes.toString('utf8'), /Hello from COS/)
  assert.match(bytes.toString('utf8'), /%%EOF/)
})
