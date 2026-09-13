// saas/tests/cosUniversityExecutionBinding.node.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  boundExecutionBindingFailure,
  scoredReplyHash,
  scoredReplyMatchesExecution,
} from '../lib/ai/cos/cosUniversityExecutionBinding.ts'

test('scored reply hashing is deterministic and reply-sensitive', () => {
  const first = scoredReplyHash('same scored answer')
  const second = scoredReplyHash('same scored answer')
  const changed = scoredReplyHash('different scored answer')
  assert.match(first, /^[a-f0-9]{64}$/)
  assert.equal(first, second)
  assert.notEqual(first, changed)
})

test('a receipt binds only the exact non-empty reply it attests', () => {
  const reply = 'This is the answer that was actually executed.'
  const execution = { responseHash: scoredReplyHash(reply) }
  assert.equal(scoredReplyMatchesExecution(reply, execution), true)
  assert.equal(scoredReplyMatchesExecution(`${reply} changed`, execution), false)
  assert.equal(scoredReplyMatchesExecution('', execution), false)
  assert.equal(scoredReplyMatchesExecution(reply, { responseHash: 'not-a-digest' }), false)
  assert.equal(scoredReplyMatchesExecution(reply, null), false)
})

test('binding failures distinguish missing reply, missing digest and mismatched digest', () => {
  const reply = 'graded answer'
  assert.equal(boundExecutionBindingFailure('', { responseHash: scoredReplyHash(reply) }), 'scored_reply_missing')
  assert.equal(boundExecutionBindingFailure(reply, {}), 'execution_response_hash_missing')
  assert.equal(boundExecutionBindingFailure(reply, { responseHash: 'x'.repeat(64) }), 'execution_response_hash_missing')
  assert.equal(
    boundExecutionBindingFailure(reply, { responseHash: scoredReplyHash('another answer') }),
    'scored_reply_execution_mismatch',
  )
  assert.equal(boundExecutionBindingFailure(reply, { responseHash: scoredReplyHash(reply) }), null)
})

test('independent exam verifies response binding before scoring the reply', () => {
  const runner = fs.readFileSync(
    path.resolve(import.meta.dirname, '../lib/ai/cos/cosUniversityIndependentExamRunner.ts'),
    'utf8',
  )
  assert.match(runner, /import \{ boundExecutionBindingFailure \} from '\.\/cosUniversityExecutionBinding\.ts'/)
  const bindingAt = runner.indexOf('const bindingFailure = boundExecutionBindingFailure(bound.reply, execution)')
  const scorerAt = runner.indexOf('const score = scoreCosUniversityBlindExam(exam, bound.reply')
  assert.ok(bindingAt > 0, 'independent exam must verify reply-to-receipt binding')
  assert.ok(scorerAt > bindingAt, 'binding verification must happen before scoring')
  assert.match(runner, /if \(bindingFailure\) return fail\(\[bindingFailure\]\)/)
})
