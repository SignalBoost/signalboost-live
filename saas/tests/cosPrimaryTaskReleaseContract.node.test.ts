import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { missingAnalyticalTasks } from '../lib/ai/cos/answerTaskContract.ts'

const source = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
const scenario = readFileSync(new URL('./fixtures/cos-incident-analysis-brief.txt', import.meta.url), 'utf8')
test('production COS primary releases by the independent verifier, never by a word rule', () => {
  assert.doesNotMatch(source, /releasableAnalyticalAnswer|missingAnalyticalTasks/)
  // The rescue lane writes its own answer, so it is verified there; an incomplete verdict is never released.
  assert.match(source, /const firstOutcome=await verifyAnswerOutcome\(\{request:input,answer:reply,judge:cosAnswerOutcomeJudge\}\)/)
  assert.match(source, /if\(!answerOutcomeReleasable\(await verifyAnswerOutcome\(\{request:input,answer:candidateReply,judge:cosAnswerOutcomeJudge\}\)\)\)return null/)
  assert.equal(missingAnalyticalTasks(scenario, 'I need readings and baselines before answering.' ).length, 8)
})
test('non-enumerated requests pass shared acceptance without changing non-analysis routing', () => {
  assert.deepEqual(missingAnalyticalTasks('Fix the login form in src/login.ts', 'Fixed the form.'), [])
})
