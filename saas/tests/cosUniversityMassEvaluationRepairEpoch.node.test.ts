import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MASS_EVALUATION_INFRASTRUCTURE_REPAIR_AT,
  MASS_EVALUATION_INFRASTRUCTURE_REPAIR_REF,
  MASS_EVALUATION_MAX_IDENTICAL_INFRASTRUCTURE_FAILURES,
  decideRollingMassEvaluationApproval,
  type RollingEvent,
} from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'

const hash = 'd'.repeat(64)
const artifact = {
  candidateId: 'mass:8f5af666',
  subjectId: 'economics_finance',
  artifactHash: hash,
  createdAt: '2026-09-14T19:12:00.000Z',
}
const canary: RollingEvent = {
  candidateId: artifact.candidateId,
  observedAt: '2026-09-16T10:00:00.000Z',
  expiresAt: null,
  verifier: 'host_production_verifier',
  evidence: { claim: 'production_canary_healthy', artifactHash: hash, exactArtifact: true, productionTrafficAuthorized: false },
}
const failure = (observedAt: string): RollingEvent => ({
  candidateId: artifact.candidateId,
  observedAt,
  expiresAt: null,
  verifier: 'host_controller',
  evidence: {
    claim: 'mass_distilled_independent_evaluation_failed',
    artifactHash: hash,
    error: 'mass_distilled_evaluation_call_timeout',
  },
})

// Timestamps are derived from the declared repair epoch rather than pinned to one repair, so
// advancing the epoch for a later evaluator fix does not silently invert what these tests assert.
const epochMs = Date.parse(MASS_EVALUATION_INFRASTRUCTURE_REPAIR_AT)
const beforeEpoch = (minutes: number) => new Date(epochMs - minutes * 60_000).toISOString()
const afterEpoch = (minutes: number) => new Date(epochMs + minutes * 60_000)

test('pre-repair identical infrastructure failures do not permanently suppress the repaired evaluator', () => {
  // The epoch advances with each evaluator repair; these assert that one exists and is well formed,
  // not which repair is current, so a future repair does not have to edit this line again.
  assert.match(MASS_EVALUATION_INFRASTRUCTURE_REPAIR_REF, /^[a-z0-9_]+$/)
  assert.match(MASS_EVALUATION_INFRASTRUCTURE_REPAIR_AT, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/)
  assert.ok(Number.isFinite(Date.parse(MASS_EVALUATION_INFRASTRUCTURE_REPAIR_AT)))
  const preRepair = [4, 3, 2, 1].map(minutes => failure(beforeEpoch(minutes)))
  const decision = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifact],
    events: [canary, ...preRepair],
    now: afterEpoch(10),
  })
  assert.equal(decision.issue, true)
  if (!decision.issue) return
  assert.equal(decision.evidence.infrastructureRepairRef, MASS_EVALUATION_INFRASTRUCTURE_REPAIR_REF)
  assert.equal(decision.evidence.infrastructureRepairAt, MASS_EVALUATION_INFRASTRUCTURE_REPAIR_AT)
})

test('four identical failures in the current repair generation still trip the circuit breaker', () => {
  const postRepair = Array.from({ length: MASS_EVALUATION_MAX_IDENTICAL_INFRASTRUCTURE_FAILURES }, (_, i) =>
    failure(afterEpoch(2 + i * 2).toISOString()))
  const decision = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifact],
    events: [canary, ...postRepair],
    now: afterEpoch(30),
  })
  assert.equal(decision.issue, false)
  assert.equal(!decision.issue && decision.reason, 'no_mass_artifact_eligible_for_rolling_evaluation')
})
