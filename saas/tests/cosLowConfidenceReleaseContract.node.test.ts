import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { missingAnalyticalTasks } from '../lib/ai/cos/answerTaskContract.ts'

const route = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
const incident = readFileSync(new URL('./fixtures/cos-incident-analysis-brief.txt', import.meta.url), 'utf8')

test('COS final low-confidence fallback applies the same analytical task gate', () => {
  assert.match(route, /function lowConfidenceDraftReply\([^\n]+userRequest: string\)/)
  assert.match(route, /const gaps = missingAnalyticalTasks\(userRequest, cos\.bestEffortReply\)/)
  assert.match(route, /if \(gaps\.length\) \{[\s\S]*?return null/)
  assert.match(route, /lowConfidenceDraftReply\(cos,reason,input\)/)
  assert.doesNotMatch(route, /lowConfidenceDraftReply\(cos,reason\)/)
})
test('the original failed incident draft is rejected by the task contract', () => {
  assert.equal(missingAnalyticalTasks(incident, 'I need more readings before investigating.' ).length, 8)
})
test('ordinary conceptual answers are not blocked', () => {
  assert.deepEqual(missingAnalyticalTasks('What is a message queue?', 'A message queue is asynchronous transport.'), [])
})
