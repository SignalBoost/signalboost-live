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
    error: 'mass_distilled_evaluation_answer_missing:0ee6ecdba3940d76:finish=length',
  },
})

test('pre-repair identical infrastructure failures do not permanently suppress the repaired evaluator', () => {
  assert.equal(MASS_EVALUATION_INFRASTRUCTURE_REPAIR_REF, 'pr_2433_qwen_final_answer_mode')
  assert.equal(MASS_EVALUATION_INFRASTRUCTURE_REPAIR_AT, '2026-09-17T21:22:15Z')
  const preRepair = [
    failure('2026-09-17T21:06:10Z'),
    failure('2026-09-17T21:08:10Z'),
    failure('2026-09-17T21:10:10Z'),
    failure('2026-09-17T21:12:10Z'),
  ]
  const decision = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifact],
    events: [canary, ...preRepair],
    now: new Date('2026-09-17T21:30:00Z'),
  })
  assert.equal(decision.issue, true)
  if (!decision.issue) return
  assert.equal(decision.evidence.infrastructureRepairRef, MASS_EVALUATION_INFRASTRUCTURE_REPAIR_REF)
  assert.equal(decision.evidence.infrastructureRepairAt, MASS_EVALUATION_INFRASTRUCTURE_REPAIR_AT)
})

test('four identical failures in the current repair generation still trip the circuit breaker', () => {
  const postRepair = Array.from({ length: MASS_EVALUATION_MAX_IDENTICAL_INFRASTRUCTURE_FAILURES }, (_, i) =>
    failure(`2026-09-17T21:${24 + i * 2}:10Z`))
  const decision = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifact],
    events: [canary, ...postRepair],
    now: new Date('2026-09-17T21:40:00Z'),
  })
  assert.equal(decision.issue, false)
  assert.equal(!decision.issue && decision.reason, 'no_mass_artifact_eligible_for_rolling_evaluation')
})
