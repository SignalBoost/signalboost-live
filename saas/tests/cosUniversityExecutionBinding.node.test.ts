// saas/tests/cosUniversityExecutionBinding.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import {
  boundExecutionBindingFailure,
  scoredReplyHash,
  scoredReplyMatchesExecution,
} from '../lib/ai/cos/cosUniversityExecutionBinding.ts'

const REPLY = 'The access-control item is unresolved, so Production readiness is not established.'
const receipt = (reply: string) => ({ responseHash: createHash('sha256').update(reply).digest('hex') })

function file(relative: string): string {
  return fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')
}

test('a receipt for the scored reply binds', () => {
  assert.equal(scoredReplyMatchesExecution(REPLY, receipt(REPLY)), true)
  assert.equal(boundExecutionBindingFailure(REPLY, receipt(REPLY)), null)
  assert.equal(scoredReplyHash(REPLY), receipt(REPLY).responseHash)
})

test('a receipt for a different answer is refused, which is the whole point', () => {
  const other = receipt('A different answer entirely, produced by some other run.')
  assert.equal(scoredReplyMatchesExecution(REPLY, other), false)
  assert.equal(boundExecutionBindingFailure(REPLY, other), 'scored_reply_execution_mismatch')
})

test('an absent or malformed digest is not a satisfied binding', () => {
  for (const execution of [null, undefined, {}, { responseHash: '' }, { responseHash: 'not-a-digest' },
    { responseHash: 'A'.repeat(64) }, { responseHash: 123 }] as const) {
    assert.equal(scoredReplyMatchesExecution(REPLY, execution as never), false)
    assert.equal(boundExecutionBindingFailure(REPLY, execution as never), 'execution_response_hash_missing')
  }
})

test('an empty reply cannot be bound to anything', () => {
  for (const reply of ['', '   ', null, undefined, 42] as const) {
    assert.equal(scoredReplyMatchesExecution(reply as never, receipt(REPLY)), false)
    assert.equal(boundExecutionBindingFailure(reply as never, receipt(REPLY)), 'scored_reply_missing')
  }
})

test('whitespace and case are part of the answer, not noise to normalize away', () => {
  assert.equal(scoredReplyMatchesExecution(`${REPLY} `, receipt(REPLY)), false)
  assert.equal(scoredReplyMatchesExecution(REPLY.toUpperCase(), receipt(REPLY)), false)
})

test('the independent exam runner refuses before scoring, not after recording', () => {
  const runner = file('lib/ai/cos/cosUniversityIndependentExamRunner.ts')
  const binding = runner.indexOf('boundExecutionBindingFailure(bound.reply')
  const scoring = runner.indexOf('scoreCosUniversityBlindExam(exam, bound.reply')
  const recording = runner.indexOf('recordCosUniversityAssessment(')
  assert.ok(binding > 0, 'exam runner does not check the binding')
  assert.ok(binding < scoring, 'binding must be checked before the reply is scored')
  assert.ok(scoring < recording, 'scoring still precedes recording')
})

test('the non-credit practice lane keeps the binding it already had', () => {
  // Practice checked this from the start. The credit-bearing lanes did not, which is the defect.
  const practice = file('lib/ai/cos/cosUniversityPracticeExecution.ts')
  assert.match(practice, /responseHash !== createHash\('sha256'\)\.update\(reply\)\.digest\('hex'\)/)
  assert.match(practice, /university_practice_execution_binding_invalid/)
})

test('the binding module grants no credit and reaches no store', () => {
  // Comments explain the defect and necessarily name grades and rubrics; the code must not touch them.
  const code = file('lib/ai/cos/cosUniversityExecutionBinding.ts')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const forbidden of ['passed', 'grade', 'rubric', 'scorer', 'recordCosUniversity', 'supabase', 'cosServiceDb']) {
    assert.ok(!code.includes(forbidden), `binding module must not reference ${forbidden}`)
  }
  assert.match(code, /^import \{ createHash \} from 'node:crypto'$/m)
  assert.equal(code.match(/^import /gm)?.length, 1, 'the binding module needs exactly one import')
})