// saas/tests/cosUniversityMassEvaluationStopMarkerRecovery.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { recoverStoppedOpenAnswer } from '../lib/ai/cos/cosUniversityMassEvaluationAnswerRecovery.ts'

const core = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')

const id = '304c5530d6dbe8cf'

test('recovers the exact Production shape: normal stop, correct open marker, non-empty terminal tail', () => {
  const text = `<<<ANSWER:${id}>>>\nA concise completed answer.`
  assert.equal(recoverStoppedOpenAnswer(text, id, 'stop'), 'A concise completed answer.')
})

test('truncated generations remain fail-closed even with the correct open marker', () => {
  const text = `<<<ANSWER:${id}>>>\nPartial answer without a closer`
  assert.equal(recoverStoppedOpenAnswer(text, id, 'length'), null)
})

test('missing open markers, empty tails and thinking text remain fail-closed', () => {
  assert.equal(recoverStoppedOpenAnswer('plain answer', id, 'stop'), null)
  assert.equal(recoverStoppedOpenAnswer(`<<<ANSWER:${id}>>>   `, id, 'stop'), null)
  assert.equal(recoverStoppedOpenAnswer(`<<<ANSWER:${id}>>>\n<think>scratch</think>\nanswer`, id, 'stop'), null)
})

test('later answer or end markers make the terminal tail ambiguous and remain fail-closed', () => {
  assert.equal(recoverStoppedOpenAnswer(`<<<ANSWER:${id}>>>\nfirst\n<<<ANSWER:other-case>>>\nsecond`, id, 'stop'), null)
  assert.equal(recoverStoppedOpenAnswer(`<<<ANSWER:${id}>>>\nfirst\n<<<END:other-case>>>`, id, 'stop'), null)
})

test('a correctly closed answer stays on the existing strict parser path', () => {
  assert.equal(recoverStoppedOpenAnswer(`<<<ANSWER:${id}>>>\nanswer\n<<<END:${id}>>>`, id, 'stop'), null)
})

test('the evaluator invokes recovery only after strict parsing fails', () => {
  assert.match(core, /try\{answers\.set\(item\.id,parseAnswers\(text,\[item\]\)\.get\(item\.id\) as string\)\}/)
  assert.match(core, /const recovered=recoverStoppedOpenAnswer\(text,item\.id,finish\)/)
  assert.match(core, /if\(recovered\)\{answers\.set\(item\.id,recovered\);continue\}/)
})
