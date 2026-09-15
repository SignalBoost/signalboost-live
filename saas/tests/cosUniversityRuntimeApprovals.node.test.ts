// saas/tests/cosUniversityRuntimeApprovals.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  approvalState,
  buildDistilledEvaluationApproval,
  isDistilledEvaluationApprovalEvidence,
  tickClearance,
} from '../lib/ai/cos/cosUniversityRuntimeApprovalPolicy.ts'

const evaluatorRoute = readFileSync(new URL('../app/api/cron/cos-university-distilled-evaluation/route.ts', import.meta.url), 'utf8')
const evaluatorLib = readFileSync(new URL('../lib/ai/cos/cosUniversityDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')
const runtime = readFileSync(new URL('../lib/ai/cos/cosUniversityRuntimeApprovals.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/admin/cos-university-runtime-approvals/route.ts', import.meta.url), 'utf8')

const HASH = 'bd7b151e75cc963d02597529b7256b755419dd20bcd2c36ca849e903d99421e4'

test('built approval satisfies every field both evaluator matchers check', () => {
  const e = buildDistilledEvaluationApproval({ candidateId: 'study-plan:x', artifactHash: HASH.toUpperCase() })
  assert.equal(e.profile, 'cos_distilled_independent_evaluation_authorization_v1')
  assert.equal(e.claim, 'distilled_independent_evaluation_approved')
  assert.equal(e.artifactHash, HASH)
  assert.equal(e.evaluationAuthorized, true)
  assert.ok(e.maxEndpointCalls >= 8 && e.maxJudgeCalls >= 4)
  assert.equal(e.maxRuntimeWakeAttempts, 1)
  assert.ok(e.maxEstimatedRuntimeWakeCostUsd >= (((570 + 60) * 0.69) / 3600) && e.maxEstimatedRuntimeWakeCostUsd <= 0.2)
  assert.equal(e.productionTrafficAuthorized, false)
  assert.equal(e.authorityExpanded, false)
  assert.equal(isDistilledEvaluationApprovalEvidence(e, { candidateId: 'study-plan:x', artifactHash: HASH }), true)
  assert.equal(isDistilledEvaluationApprovalEvidence({ ...e, maxEstimatedRuntimeWakeCostUsd: 0.01 }, { candidateId: 'study-plan:x', artifactHash: HASH }), false)
  assert.equal(isDistilledEvaluationApprovalEvidence(e, { candidateId: 'study-plan:y', artifactHash: HASH }), false)
  // The matchers still check these exact names; if they are renamed this test must be revisited.
  for (const source of [evaluatorRoute, evaluatorLib]) {
    assert.match(source, /evidence\?\.evaluationAuthorized === true/)
    assert.match(source, /evidence\?\.productionTrafficAuthorized === false/)
    assert.match(source, /distilled_independent_evaluation_approved/)
  }
  assert.match(evaluatorRoute, /Number\(evidence\?\.maxRuntimeWakeAttempts \|\| 0\) === MAX_RUNTIME_WAKE_ATTEMPTS/)
})

test('malformed identity is refused before any write', () => {
  assert.throws(() => buildDistilledEvaluationApproval({ candidateId: '', artifactHash: HASH }), /candidate_missing/)
  assert.throws(() => buildDistilledEvaluationApproval({ candidateId: 'x', artifactHash: 'abc' }), /artifact_hash_invalid/)
})

test('issuing inside the clearance window before a tick is refused', () => {
  assert.equal(tickClearance(new Date('2026-09-15T21:09:30Z')).ok, false)
  assert.equal(tickClearance(new Date('2026-09-15T21:08:50Z')).ok, false)
  const clear = tickClearance(new Date('2026-09-15T21:01:57Z'))
  assert.equal(clear.ok, true)
  assert.equal(clear.nextTickAt, '2026-09-15T21:10:00.000Z')
})

test('approval state distinguishes armed, consumed and expired', () => {
  const now = new Date('2026-09-15T21:05:00Z')
  const approval = { observed_at: '2026-09-15T21:01:57.337185+00:00', expires_at: '2026-09-15T23:01:57.337185+00:00', evidence: {} }
  assert.equal(approvalState({ approval: null, attempts: [], now }), 'none')
  assert.equal(approvalState({ approval, attempts: [], now }), 'armed')
  assert.equal(approvalState({ approval, attempts: [{ evidence: { authorizationObservedAt: '2026-09-15T21:01:57.337+00:00' } }], now }), 'consumed')
  assert.equal(approvalState({ approval, attempts: [], now: new Date('2026-09-16T00:00:00Z') }), 'expired')
  assert.equal(approvalState({ approval: { ...approval, observed_at: '2026-09-15T22:00:00Z' }, attempts: [], now }), 'none')
})

test('runtime targets the evaluator artifact, refuses a second armed approval, and confirms by read-back', () => {
  assert.match(runtime, /\.eq\('status', 'evaluation_pending'\)[\s\S]*\.eq\('trained_artifact_id', DISTILLED_ADAPTER_MODEL_ID\)/)
  assert.match(runtime, /approval_already_armed/)
  assert.match(runtime, /too_close_to_evaluator_tick/)
  assert.match(runtime, /\.eq\('event_key', eventKey\)[\s\S]*approval_not_persisted/)
  assert.match(runtime, /verifier: 'host_controller'/)
  assert.match(runtime, /isDistilledEvaluationApprovalEvidence/)
  assert.match(runtime, /evidence\.runnerInvoked !== true/)
  assert.match(runtime, /state === 'consumed'/)
})

test('route is owner-only and issues only the evaluation kind', () => {
  assert.equal((route.match(/await requireOwner\(\)/g) || []).length, 2)
  assert.match(route, /!== 'distilled_evaluation'/)
  assert.match(route, /approval_kind_not_permitted/)
})
