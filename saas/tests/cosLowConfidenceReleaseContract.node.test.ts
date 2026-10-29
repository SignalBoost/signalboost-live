import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { missingAnalyticalTasks } from '../lib/ai/cos/answerTaskContract.ts'

const route = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
const incident = readFileSync(new URL('./fixtures/cos-incident-analysis-brief.txt', import.meta.url), 'utf8')

test('COS final low-confidence fallback releases only a draft the reasoner verifier already let through', () => {
  assert.match(route, /function lowConfidenceDraftReply\(cos: [^\n]+, reason: \{ detail: string \}\): string \| null/)
  assert.doesNotMatch(route, /releasableAnalyticalAnswer/)
  assert.match(route, /lowConfidenceDraftReply\(cos,reason\)/)
})
test('the original failed incident draft is rejected by the task contract', () => {
  assert.equal(missingAnalyticalTasks(incident, 'I need more readings before investigating.' ).length, 8)
})
test('ordinary conceptual answers are not blocked', () => {
  assert.deepEqual(missingAnalyticalTasks('What is a message queue?', 'A message queue is asynchronous transport.'), [])
})
