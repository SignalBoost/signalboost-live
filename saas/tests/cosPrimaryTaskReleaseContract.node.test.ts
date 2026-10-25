import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { missingAnalyticalTasks } from '../lib/ai/cos/answerTaskContract.ts'

const source = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
const scenario = readFileSync(new URL('./fixtures/cos-incident-analysis-brief.txt', import.meta.url), 'utf8')
test('production COS primary cannot release handled or best-effort incomplete analysis as success', () => {
  assert.match(source, /if\(cos\?\.handled&&missingAnalyticalTasks\(input,cos\.reply\)\.length===0\)/)
  assert.match(source, /cos\.bestEffortReply\.trim\(\)&&missingAnalyticalTasks\(input,cos\.bestEffortReply\)\.length===0/)
  assert.equal(missingAnalyticalTasks(scenario, 'I need readings and baselines before answering.' ).length, 8)
})
test('non-enumerated requests pass shared acceptance without changing non-analysis routing', () => {
  assert.deepEqual(missingAnalyticalTasks('Fix the login form in src/login.ts', 'Fixed the form.'), [])
})
