import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const training = readFileSync(new URL('../lib/cos-core/layers/learning/webTrainingDataLayer.ts', import.meta.url), 'utf8')
const harness = readFileSync(new URL('../platform-harness/capabilities/web-knowledge.ts', import.meta.url), 'utf8')

test('COS live research searches the original question rather than curriculum keywords', () => {
  assert.match(training, /options\.queryMode === 'live_reference' \? clean\(query\)/)
  assert.match(harness, /queryMode: 'live_reference', minCredibility: 0\.7/)
})

test('live research accepts readable concise pages but learning retains 700-character screening', () => {
  assert.match(training, /options\.queryMode === 'live_reference' \? 180 : MIN_READABLE_PAGE_CHARS/)
  assert.match(training, /async function readTrainingPage\(fetcher: FetchLike, hit: SearchHit, minimumReadableChars = MIN_READABLE_PAGE_CHARS\)/)
})
