// saas/tests/cosUniversityRuntimeApprovals.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  approvalState,
  buildDistilledEvaluationApproval,
  completedIndependentEvaluation,
  delayedRetentionRecovery,
  distilledEvaluationCallCeilings,
  isDistilledEvaluationApprovalEvidence,
  tickClearance,
} from '../lib/ai/cos/cosUniversityRuntimeApprovalPolicy.ts'

const evaluatorRoute = readFileSync(new URL('../app/api/cron/cos-university-distilled-evaluation/route.ts', import.meta.url), 'utf8')
const evaluatorLib = readFileSync(new URL('../lib/ai/cos/cosUniversityDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')
const runtime = readFileSync(new URL('../lib/ai/cos/cosUniversityRuntimeApprovals.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/admin/cos-university-runtime-approvals/route.ts', import.meta.url), 'utf8')

const HASH = 'bd7b151e75cc963d02597529b7256b755419dd20bcd2c36ca849e903d99421e4'

test('built approval satisfies every field both evaluator matchers check', () => {
  const e = buildDistilledEvaluationApproval({ candidateId: 'study-plan:x', artifactHash: HASH.toUpperCase(), holdoutCaseCount: 20 })
  assert.equal(e.profile, 'cos_distilled_independent_evaluation_authorization_v1')
  assert.equal(e.claim, 'distilled_independent_evaluation_approved')
  assert.equal(e.artifactHash, HASH)
  assert.equal(e.evaluationAuthorized, true)
  assert.equal(e.holdoutCaseCount, 20)
  assert.equal(e.maxEndpointCalls, 12)
  assert.equal(e.maxJudgeCalls, 5)
  assert.equal(e.maxSoloRetryCalls, 2)
  assert.equal(e.maxRuntimeWakeAttempts, 1)
  assert.ok(e.maxEstimatedRuntimeWakeCostUsd >= (((570 + 60) * 0.69) / 3600) && e.maxEstimatedRuntimeWakeCostUsd <= 0.2)
  assert.equal(e.productionTrafficAuthorized, false)
  assert.equal(e.authorityExpanded, false)
  assert.equal(isDistilledEvaluationApprovalEvidence(e, { candidateId: 'study-plan:x', artifactHash: HASH, holdoutCaseCount: 20 }), true)
  assert.equal(isDistilledEvaluationApprovalEvidence(e, { candidateId: 'study-plan:x', artifactHash: HASH, holdoutCaseCount: 12 }), false)
  assert.equal(isDistilledEvaluationApprovalEvidence({ ...e, maxEndpointCalls: 11 }, { candidateId: 'study-plan:x', artifactHash: HASH }), false)
  assert.equal(isDistilledEvaluationApprovalEvidence({ ...e, maxEstimatedRuntimeWakeCostUsd: 0.01 }, { candidateId: 'study-plan:x', artifactHash: HASH }), false)
  assert.equal(isDistilledEvaluationApprovalEvidence(e, { candidateId: 'study-plan:y', artifactHash: HASH }), false)
  for (const source of [evaluatorRoute, evaluatorLib]) {
    assert.match(source, /isDistilledEvaluationApprovalEvidence/)
  }
  assert.match(evaluatorRoute, /Number\(evidence\?\.maxRuntimeWakeAttempts \|\| 0\) === MAX_RUNTIME_WAKE_ATTEMPTS/)
})

test('malformed identity is refused before any write', () => {
  assert.throws(() => buildDistilledEvaluationApproval({ candidateId: '', artifactHash: HASH, holdoutCaseCount: 12 }), /candidate_missing/)
  assert.throws(() => buildDistilledEvaluationApproval({ candidateId: 'x', artifactHash: 'abc', holdoutCaseCount: 12 }), /artifact_hash_invalid/)
  assert.throws(() => buildDistilledEvaluationApproval({ candidateId: 'x', artifactHash: HASH, holdoutCaseCount: 0 }), /holdout_case_count_invalid/)
  assert.throws(() => distilledEvaluationCallCeilings(61), /holdout_case_count_invalid/)
})

test('call ceilings scale with the pinned holdout and reserve only two recovery calls', () => {
  assert.deepEqual(distilledEvaluationCallCeilings(1), {
    holdoutCaseCount: 1, maxEndpointCalls: 10, maxJudgeCalls: 4, maxSoloRetryCalls: 2,
  })
  assert.deepEqual(distilledEvaluationCallCeilings(12), {
    holdoutCaseCount: 12, maxEndpointCalls: 10, maxJudgeCalls: 4, maxSoloRetryCalls: 2,
  })
  assert.deepEqual(distilledEvaluationCallCeilings(13), {
    holdoutCaseCount: 13, maxEndpointCalls: 12, maxJudgeCalls: 5, maxSoloRetryCalls: 2,
  })
  assert.deepEqual(distilledEvaluationCallCeilings(60), {
    holdoutCaseCount: 60, maxEndpointCalls: 18, maxJudgeCalls: 8, maxSoloRetryCalls: 2,
  })
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
  assert.match(runtime, /partition_manifests_registered/)
  assert.match(runtime, /revisionKey/)
  assert.match(runtime, /distilledEvaluationCallCeilings/)
  assert.match(runtime, /evidence\.runnerInvoked !== true/)
  assert.match(runtime, /approvalLifecycle === 'consumed'/)
})

test('route is owner-only and issues only the evaluation kind', () => {
  assert.equal((route.match(/await requireOwner\(\)/g) || []).length, 2)
  assert.match(route, /!== 'distilled_evaluation'/)
  assert.match(route, /approval_kind_not_permitted/)
})

test('one independent verdict per artifact: an evaluated artifact cannot be re-authorized', () => {
  const rows = [
    { observed_at: '2026-09-15T21:15:12Z', evidence: { claim: 'delayed_retention_passed', artifactHash: HASH } },
    { observed_at: '2026-09-15T21:15:10Z', evidence: { claim: 'independent_evaluation', artifactHash: HASH, baselineScore: 0.55, trainedArtifactScore: 0.6833 } },
  ]
  const verdict = completedIndependentEvaluation(rows, HASH.toUpperCase())
  assert.ok(verdict)
  assert.equal(verdict?.improved, true)
  assert.equal(completedIndependentEvaluation(rows, 'a'.repeat(64)), null)
  const failed = completedIndependentEvaluation([
    { observed_at: 'x', evidence: { claim: 'independent_evaluation', artifactHash: HASH, baselineScore: 0.6, trainedArtifactScore: 0.5 } },
  ], HASH)
  assert.equal(failed?.improved, false)
  assert.match(runtime, /\.eq\('verifier', 'independent_scorer'\)/)
  assert.match(runtime, /if \(evaluation && !retentionRecovery\) return \{ ok: false as const, error: 'artifact_already_independently_evaluated'/)
  const page = readFileSync(new URL('../app/dashboard/cos-university-approvals/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /status\?\.state === 'evaluated'/)
})

test('a premature legacy verdict unlocks only when delayed retention is due', () => {
  const row = {
    created_at: '2026-09-15T12:00:00Z',
    artifact_age_seconds: 60 * 60,
    delayed_retention_passed: false,
  }
  const waiting = delayedRetentionRecovery(row, new Date('2026-09-15T20:00:00Z'))
  assert.equal(waiting?.ready, false)
  assert.equal(waiting?.readyAt, '2026-09-15T23:00:00.000Z')
  assert.equal(delayedRetentionRecovery(row, new Date('2026-09-15T23:00:00Z'))?.ready, true)
  assert.equal(delayedRetentionRecovery({ ...row, artifact_age_seconds: 12 * 60 * 60 }, new Date('2026-09-16T00:00:00Z')), null)
  assert.match(runtime, /error: 'delayed_retention_not_due'/)
  assert.match(runtime, /evaluation && !retentionRecovery/)
  assert.match(runtime, /retentionReadyAt: new Date\(trainedAt \+ DISTILLED_EVALUATION_RETENTION_DELAY_MS\)/)
  assert.match(runtime, /\.eq\('revision_key', revisionKey\)[\s\S]*\.eq\('evaluator_version', DISTILLED_EVALUATOR_VERSION\)/)
})
