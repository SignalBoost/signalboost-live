import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const boundary = readFileSync(new URL('../components/AssistantSourceFileBoundary.tsx', import.meta.url), 'utf8')
const layout = readFileSync(new URL('../app/dashboard/assistant/layout.tsx', import.meta.url), 'utf8')

test('Assistant picker visibly accepts executable source extensions', () => {
  for (const extension of ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.tsx', '.jsx', '.py']) {
    assert.match(boundary, new RegExp(extension.replace('.', '\\.'), 'i'))
  }
  assert.match(boundary, /input\.accept = expanded\.join\(','\)/)
})

test('source files are normalized to the existing admitted text MIME before React validation', () => {
  assert.match(boundary, /document\.addEventListener\('change', onChange, true\)/)
  assert.match(boundary, /const ADMITTED_TEXT_MIME = 'text\/plain'/)
  assert.match(boundary, /new File\(\[file\], file\.name, \{ type: ADMITTED_TEXT_MIME/)
  assert.match(boundary, /input\.files = normalized/)
  assert.match(boundary, /file\.type === ADMITTED_TEXT_MIME/)
  assert.doesNotMatch(boundary, /text\/javascript|text\/typescript|text\/x-python/)
})

test('normalization is scoped to the Assistant layout and leaves server limits intact', () => {
  assert.match(layout, /AssistantSourceFileBoundary/)
  assert.match(layout, /<AssistantSourceFileBoundary>/)
  assert.match(layout, /<AssistantTransportBoundary>/)
  assert.doesNotMatch(boundary, /MAX_FILE_BYTES|fetch\(|\/api\/builder/)
})
