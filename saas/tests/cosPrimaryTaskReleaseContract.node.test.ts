import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { missingAnalyticalTasks } from '../lib/ai/cos/answerTaskContract.ts'

const source = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
const scenario = readFileSync(new URL('./fixtures/cos-incident-analysis-brief.txt', import.meta.url), 'utf8')
test('production COS primary cannot release handled or best-effort incomplete analysis as success', () => {
  // Production 2026-10-25: releasable = meets the contract, or a substantive analysis; a non-answer never is.
  assert.match(source, /if\(cos\?\.handled&&releasableAnalyticalAnswer\(input,cos\.reply\)\)/)
  assert.match(source, /cos\.bestEffortReply\.trim\(\)&&releasableAnalyticalAnswer\(input,cos\.bestEffortReply\)/)
  assert.equal(missingAnalyticalTasks(scenario, 'I need readings and baselines before answering.' ).length, 8)
})
test('non-enumerated requests pass shared acceptance without changing non-analysis routing', () => {
  assert.deepEqual(missingAnalyticalTasks('Fix the login form in src/login.ts', 'Fixed the form.'), [])
})
