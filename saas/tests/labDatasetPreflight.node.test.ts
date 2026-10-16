import assert from 'node:assert/strict'
import test from 'node:test'
import { previewLabDataset, previewLabPrompts } from '../lib/lab/labDatasetPreflight.ts'

const row = (prompt: string, response: string) => JSON.stringify({ prompt, response })
test('dataset preflight counts clean 20-row input without provider calls', () => {
  const preview = previewLabDataset(Array.from({ length: 20 }, (_, n) => row('question-' + n, 'answer-' + n)).join('\n'))
  assert.equal(preview.uniquePrompts, 20)
  assert.equal(preview.validRows, 20)
  assert.equal(preview.ready, true)
})
test('dataset preflight reports malformed rows, exact duplicates and contradictory prompts', () => {
  const preview = previewLabDataset([row('a', 'yes'), row('a', 'yes'), row('a', 'no'), '{oops', 'null', row('b', 'ok')].join('\n'))
  assert.equal(preview.invalidLines, 2)
  assert.equal(preview.duplicateRows, 1)
  assert.equal(preview.conflictingPrompts, 1)
  assert.equal(preview.uniquePrompts, 2)
  assert.equal(preview.ready, false)
})
test('dataset preflight reports truncation and source limit', () => {
  const long = row('z'.repeat(8001), 'response')
  const preview = previewLabDataset([long, ...Array.from({ length: 130 }, (_, n) => row('item' + n, 'ok'))].join('\n'))
  assert.equal(preview.truncatedFields, 1)
  assert.equal(preview.extraRows, 3)
  assert.equal(preview.ready, false)
})
test('empty and non-string fields are invalid rather than stringified', () => {
  const preview = previewLabDataset(['{}', '{"prompt":null,"response":"x"}', '{"prompt":"a","response":{}}', row('valid', 'answer')].join('\n'))
  assert.equal(preview.invalidLines, 3)
  assert.equal(preview.uniquePrompts, 1)
})

test('teacher prompt preview deduplicates after the server 4000-character boundary', () => {
  const shared='a'.repeat(4000)
  const preview=previewLabPrompts([shared+'x',shared+'y','valid'].join('\n'))
  assert.equal(preview.uniquePrompts,2)
  assert.equal(preview.duplicatePrompts,1)
  assert.equal(preview.truncatedPrompts,2)
  assert.equal(preview.ready,false)
})
test('teacher prompt preview accepts a bounded distinct 20-prompt batch', () => {
  const preview=previewLabPrompts(Array.from({length:20},(_,n)=>'prompt-'+n).join('\n'))
  assert.equal(preview.uniquePrompts,20)
  assert.equal(preview.ready,true)
})
