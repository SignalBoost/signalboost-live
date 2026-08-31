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

test('source files are normalized before the existing React change handler', () => {
  assert.match(boundary, /document\.addEventListener\('change', onChange, true\)/)
  assert.match(boundary, /new File\(\[file\], file\.name/)
  assert.match(boundary, /input\.files = normalized/)
  assert.match(boundary, /file\.type === expected/)
  assert.match(boundary, /text\/javascript/)
  assert.match(boundary, /text\/typescript/)
  assert.match(boundary, /text\/x-python/)
})

test('normalization is scoped to the Assistant layout and leaves server limits intact', () => {
  assert.match(layout, /AssistantSourceFileBoundary/)
  assert.match(layout, /<AssistantSourceFileBoundary>/)
  assert.match(layout, /<AssistantTransportBoundary>/)
  assert.doesNotMatch(boundary, /MAX_FILE_BYTES|fetch\(|\/api\/builder/)
})
