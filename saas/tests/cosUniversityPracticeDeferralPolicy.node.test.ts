// saas/tests/cosUniversityPracticeDeferralPolicy.node.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  MAX_PRACTICE_DEFERRALS,
  decidePracticeDeferral,
  practiceDeferralCount,
  practiceDeferralMetadata,
} from '../lib/ai/cos/cosUniversityPracticeDeferralPolicy.ts'

const runner = fs.readFileSync(
  path.join(process.cwd(), 'lib/ai/cos/cosUniversityDeliberatePracticeRunner.ts'), 'utf8')

test('a transient failure is still free: early deferrals retry and cost no attempt', () => {
  let metadata: Record<string, unknown> | null = null
  for (let attempt = 1; attempt < MAX_PRACTICE_DEFERRALS; attempt += 1) {
    const decision = decidePracticeDeferral({ metadata, reason: 'local_reasoner_unavailable' })
    assert.equal(decision.retry, true, `deferral ${attempt} should still retry`)
    assert.equal(decision.deferrals, attempt)
    metadata = practiceDeferralMetadata(metadata, decision.deferrals)
  }
})

test('a permanently failing row becomes terminal instead of cycling forever', () => {
  // The production case: practice_json_unparseable every fifteen minutes, attempt_count stuck at 0.
  const metadata = { practiceDeferrals: MAX_PRACTICE_DEFERRALS - 1, agentId: 'software-specialist' }
  const decision = decidePracticeDeferral({ metadata, reason: 'practice_json_unparseable:chars=0:sample=(empty)' })
  assert.equal(decision.retry, false)
  assert.match(decision.reason, /^practice_json_unparseable:chars=0:sample=\(empty\)/)
  assert.match(decision.reason, /no longer retrying/)
})

test('the original cause survives into the terminal record', () => {
  const decision = decidePracticeDeferral({ metadata: { practiceDeferrals: 99 }, reason: 'service_database_unavailable' })
  assert.equal(decision.retry, false)
  assert.ok(decision.reason.startsWith('service_database_unavailable'), decision.reason)
})

test('other metadata the host wrote is preserved, never replaced', () => {
  const merged = practiceDeferralMetadata(
    { agentId: 'software-specialist', universityPlanId: 'plan-1', practiceRound: '3' }, 2)
  assert.deepEqual(merged, {
    agentId: 'software-specialist', universityPlanId: 'plan-1', practiceRound: '3', practiceDeferrals: 2,
  })
})

test('malformed or missing counters read as zero rather than skipping the budget', () => {
  for (const bad of [null, undefined, {}, { practiceDeferrals: 'many' }, { practiceDeferrals: -4 },
    { practiceDeferrals: Number.NaN }, [] as unknown as Record<string, unknown>]) {
    assert.equal(practiceDeferralCount(bad), 0, JSON.stringify(bad))
  }
  assert.equal(decidePracticeDeferral({ metadata: { practiceDeferrals: 'many' }, reason: 'x' }).retry, true)
})

test('the runner records the decision instead of unconditionally requeueing', () => {
  assert.match(runner, /decidePracticeDeferral\(\{ metadata: item\.metadata, reason \}\)/)
  assert.match(runner, /status: decision\.retry \? 'queued' : 'failed'/)
  assert.match(runner, /next_attempt_at: decision\.retry \?/)
  assert.match(runner, /metadata: practiceDeferralMetadata\(item\.metadata, decision\.deferrals\)/)
})
