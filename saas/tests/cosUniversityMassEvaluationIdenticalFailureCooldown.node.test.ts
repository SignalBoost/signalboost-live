// saas/tests/cosUniversityMassEvaluationIdenticalFailureCooldown.node.test.ts
//
// The identical-infrastructure-failure circuit breaker had no time bound. Four identical failures skipped the
// artifact on every later tick forever, releasable only by a hand-inserted reopen event. The commonest failure
// on this lane is mass_distilled_evaluation_runtime_not_ready, which is transient by nature: no worker bound
// inside the ready window, nothing reached the artifact, nothing is wrong with it. Four unlucky ticks were
// enough to sideline it permanently, which is a direct cause of eligible artifacts sitting unevaluated.
//
// The breaker is now a decaying cooldown. These tests pin both halves: the artifact does wait, and it does
// come back — and nothing about the substantive-failure budget or the issued approval shape moved.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT,
  MASS_EVALUATION_MAX_IDENTICAL_INFRASTRUCTURE_FAILURES,
  MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
  decideRollingMassEvaluationApproval,
  identicalInfrastructureFailureCooldownMs,
  type RollingEvent,
} from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'
import { MASS_EVALUATION_ENDPOINT_CALLS } from '../lib/ai/cos/cosUniversityMassEvaluationContextBudget.ts'

const MINUTE = 60_000
const HOUR = 3_600_000

const hash = 'c41b90de'.padEnd(64, 'c')
const artifact = {
  candidateId: 'mass:reasoning:7',
  subjectId: 'Reasoning & Decision Science',
  artifactHash: hash,
  createdAt: '2026-09-19T00:00:00Z',
}

const ev = (
  verifier: string,
  evidence: Record<string, unknown>,
  observedAt: string,
  expiresAt: string | null = null,
): RollingEvent => ({ candidateId: artifact.candidateId, verifier, evidence, observedAt, expiresAt })

const canary = ev('host_production_verifier', {
  claim: 'production_canary_healthy',
  artifactHash: hash,
  exactArtifact: true,
  productionTrafficAuthorized: false,
}, '2026-09-19T01:00:00Z')

const approval = ev('host_controller', {
  claim: 'distilled_independent_evaluation_approved',
  artifactHash: hash,
  authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
  maxEndpointCalls: MASS_EVALUATION_ENDPOINT_CALLS,
}, '2026-09-20T09:50:00Z', '2026-09-20T09:55:00Z')

const NOT_READY = 'mass_distilled_evaluation_runtime_not_ready:network'

// Newest failure is always 10:06:00Z so every case below measures from one instant.
function failures(error: string, count: number): RollingEvent[] {
  const newestMs = Date.parse('2026-09-20T10:06:00Z')
  return Array.from({ length: count }, (_unused, index) => ev('host_controller', {
    claim: 'mass_distilled_independent_evaluation_failed',
    artifactHash: hash,
    error,
  }, new Date(newestMs - index * 2 * MINUTE).toISOString()))
}

function decide(events: readonly RollingEvent[], nowIso: string) {
  return decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifact],
    events: [canary, approval, ...events],
    now: new Date(nowIso),
  })
}

test('the cooldown ladder grows with each further identical failure and is capped', () => {
  assert.equal(identicalInfrastructureFailureCooldownMs(0), 0)
  assert.equal(identicalInfrastructureFailureCooldownMs(MASS_EVALUATION_MAX_IDENTICAL_INFRASTRUCTURE_FAILURES - 1), 0)
  assert.equal(identicalInfrastructureFailureCooldownMs(4), 30 * MINUTE)
  assert.equal(identicalInfrastructureFailureCooldownMs(5), 1 * HOUR)
  assert.equal(identicalInfrastructureFailureCooldownMs(6), 2 * HOUR)
  assert.equal(identicalInfrastructureFailureCooldownMs(7), 4 * HOUR)
  assert.equal(identicalInfrastructureFailureCooldownMs(8), 12 * HOUR)
  assert.equal(identicalInfrastructureFailureCooldownMs(400), 12 * HOUR)
  // Never negative, never NaN-driven.
  assert.equal(identicalInfrastructureFailureCooldownMs(Number.NaN), 0)
  assert.equal(identicalInfrastructureFailureCooldownMs(-3), 0)
})

test('below the threshold nothing waits at all', () => {
  const decision = decide(failures(NOT_READY, MASS_EVALUATION_MAX_IDENTICAL_INFRASTRUCTURE_FAILURES - 1), '2026-09-20T10:08:00Z')
  assert.equal(decision.issue, true)
})

test('four identical readiness failures hold the artifact, then release it when the cooldown elapses', () => {
  const four = failures(NOT_READY, 4)
  // Two minutes later: the old behaviour and the new one agree - do not retry yet.
  assert.equal(decide(four, '2026-09-20T10:08:00Z').issue, false)
  assert.equal(decide(four, '2026-09-20T10:35:00Z').issue, false)
  // Past 30 minutes the artifact comes back on its own, which is the whole point.
  const released = decide(four, '2026-09-20T10:40:00Z')
  assert.equal(released.issue, true)
  if (!released.issue) return
  // Released through the ordinary bounded approval, not a widened one.
  assert.equal(released.evidence.maxEndpointCalls, MASS_EVALUATION_ENDPOINT_CALLS)
  assert.equal(released.evidence.maxRuntimeWakeAttempts, 1)
  assert.equal(released.evidence.maxEstimatedRuntimeWakeCostUsd, 0.2)
  assert.equal(released.evidence.productionTrafficAuthorized, false)
  assert.equal(released.evidence.authorityExpanded, false)
})

test('a fifth identical failure makes the artifact wait longer, not the same', () => {
  const five = failures(NOT_READY, 5)
  // 30 minutes was enough at four identical failures; at five it is not.
  assert.equal(decide(five, '2026-09-20T10:40:00Z').issue, false)
  assert.equal(decide(five, '2026-09-20T11:00:00Z').issue, false)
  assert.equal(decide(five, '2026-09-20T11:10:00Z').issue, true)
})

test('a different newest failure resets the run and retries immediately', () => {
  const mixed = [
    ...failures(NOT_READY, 6),
    ev('host_controller', {
      claim: 'mass_distilled_independent_evaluation_failed',
      artifactHash: hash,
      error: 'mass_distilled_evaluation_judge_unavailable',
    }, '2026-09-20T10:08:00Z'),
  ]
  assert.equal(decide(mixed, '2026-09-20T10:09:00Z').issue, true)
})

test('the substantive-failure budget is untouched: a cooled-down artifact that really failed stays out', () => {
  // Not an infrastructure failure, so these spend the artifact's real attempt budget. No amount of waiting
  // may bring it back - the cooldown must only ever govern infrastructure repeats.
  const substantive = failures('mass_distilled_evaluation_holdout_integrity_failed', MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT)
  assert.equal(decide(substantive, '2026-09-20T10:08:00Z').issue, false)
  assert.equal(decide(substantive, '2026-09-22T10:08:00Z').issue, false)
  assert.equal(decide(substantive, '2026-10-20T10:08:00Z').issue, false)
})
