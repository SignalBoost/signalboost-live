import assert from 'node:assert/strict'
import test from 'node:test'
import { extractFailureEvidence, trimObjectiveForHarness, runSoftwareDelegationWithSafeRetry } from '../lib/ai/cos/softwareSpecialistRecovery.ts'
import { parseSignalBoostRepositoryRepairTarget } from '../lib/builder/repository-repair-target.ts'

test('long logs retain the request, exact snapshot and failing test instead of passing output', () => {
  const log = ['Please fix this build, commit and merge.',
    'Cloning github.com/SignalBoost/signalboost-live (Branch: fix/example, Commit: abcdef1234567890)',
    'Running npm on Vercel',
    ...Array.from({length: 500}, (_, i) => '✔ passing test ' + i),
    '✖ failing tests:',
    'test at tests/broken.test.ts:4:1',
    'AssertionError: wrong result',
    'Error: Command "node --test tests/broken.test.ts" exited with 1'].join('\n')
  const trimmed = trimObjectiveForHarness(log)
  assert.ok(trimmed.length < 8000)
  assert.match(trimmed, /Please fix this build/)
  assert.match(trimmed, /AssertionError/)
  assert.doesNotMatch(trimmed, /passing test 200/)
  const target = parseSignalBoostRepositoryRepairTarget(trimmed)
  assert.equal(target?.branch, 'fix/example')
  assert.equal(target?.commitSha, 'abcdef1234567890')
  assert.ok(target?.pathHints.includes('saas/tests/broken.test.ts'))
})

test('bounded failure evidence keeps first and final errors', () => {
  const text = ['Error: first defect', ...Array.from({length: 300}, (_, i) => 'failed ' + i), 'Error: final defect'].join('\n')
  const result = extractFailureEvidence(text, 500)
  assert.ok(result.length <= 500)
  assert.match(result, /first defect/)
  assert.match(result, /final defect/)
  assert.equal(extractFailureEvidence('ordinary text', 5), ' text')
})

test('only an audit-store failure before execution retries once', async () => {
  let attempts = 0, calls = 0
  const result = await runSoftwareDelegationWithSafeRetry(async execute => {
    attempts++
    if (attempts === 1) return {ok: false as const, code: 'harness_evidence_sink_unavailable', runId: 'one'}
    return {ok: true as const, value: await execute(), runId: 'two'}
  }, async () => ++calls)
  assert.equal(result.ok, true)
  assert.equal(attempts, 2)
  assert.equal(calls, 1)
})

test('timeouts, missing permissions and unverified queued work never replay', async () => {
  for (const code of ['deadline_exceeded', 'harness_software_specialist_exact_scope_required', 'software_specialist_delegation_not_executed', 'harness_evidence_sink_unavailable']) {
    let attempts = 0, calls = 0
    await runSoftwareDelegationWithSafeRetry(async execute => {
      attempts++
      if (code === 'harness_evidence_sink_unavailable') await execute()
      return {ok: false as const, code, runId: 'one'}
    }, async () => ++calls)
    assert.equal(attempts, 1)
    assert.equal(calls, code === 'harness_evidence_sink_unavailable' ? 1 : 0)
  }
})
