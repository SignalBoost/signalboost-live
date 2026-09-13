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

test('every credit-bearing lane binds the reply it scores, not just the first one fixed', () => {
  // The non-credit practice lane was stricter than all five graded lanes. Any new graded lane that
  // reaches the bound executor and skips this check reopens the same hole, so the list is explicit.
  for (const lane of [
    'cosUniversityIndependentExamRunner',
    'cosUniversityARangeRunner',
    'cosUniversityLanguageARangeRunner',
    'cosUniversityRetentionRunner',
    'cosUniversityMastersExamRunner',
  ]) {
    const source = file(`lib/ai/cos/${lane}.ts`)
    assert.match(source, /import \{ boundExecutionBindingFailure \} from '\.\/cosUniversityExecutionBinding\.ts'/, lane)
    const binding = source.indexOf('boundExecutionBindingFailure(bound.reply')
    const identity = source.indexOf("'agent_execution_identity_mismatch'")
    assert.ok(binding > 0, `${lane} does not bind the scored reply`)
    assert.ok(identity > 0 && identity < binding, `${lane} must keep its identity check ahead of the binding`)
  }
})

test('a lane that calls the bound executor and never binds the reply is a gap', () => {
  // Guards against a sixth lane appearing without the check. Practice does its own equivalent
  // binding inline, so it is listed as satisfied rather than exempt.
  const dir = new URL('../lib/ai/cos/', import.meta.url)
  const bound = fs.readdirSync(dir)
    .filter(name => name.endsWith('.ts'))
    .filter(name => fs.readFileSync(new URL(name, dir), 'utf8').includes('executeBoundAgentExam('))
    .filter(name => !name.endsWith('.node.test.ts') && name !== 'cosUniversityAgentExamRuntime.ts')
  for (const name of bound) {
    const source = fs.readFileSync(new URL(name, dir), 'utf8')
    assert.ok(
      source.includes('boundExecutionBindingFailure(bound.reply'),
      `${name} reaches the bound executor without binding the scored reply`,
    )
  }
  assert.ok(bound.length >= 5, `expected the five graded lanes, found ${bound.length}`)
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