// saas/tests/cosUniversityMassEvaluationJudgeUnavailableInfrastructure.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
  decideRollingMassEvaluationApproval,
  type RollingEvent,
} from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'

const candidateId = 'mass:judge-unavailable:1'
const artifactHash = 'a'.repeat(64)
const artifact = {
  candidateId,
  subjectId: 'computer_science',
  artifactHash,
  createdAt: '2026-09-16T00:00:00Z',
}

function event(verifier: string, evidence: Record<string, unknown>, observedAt: string, expiresAt: string | null = null): RollingEvent {
  return { candidateId, verifier, evidence: { artifactHash, ...evidence }, observedAt, expiresAt }
}

test('judge_unavailable is evaluator infrastructure and does not consume a substantive model attempt', () => {
  const events: RollingEvent[] = [
    event('host_production_verifier', {
      claim: 'production_canary_healthy',
      exactArtifact: true,
      productionTrafficAuthorized: false,
    }, '2026-09-17T22:45:00Z'),
    event('host_controller', {
      claim: 'distilled_independent_evaluation_approved',
      authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
    }, '2026-09-17T22:52:00Z', '2026-09-18T00:52:00Z'),
    event('host_controller', {
      claim: 'mass_distilled_independent_evaluation_started',
    }, '2026-09-17T22:52:10Z'),
    event('host_controller', {
      claim: 'mass_distilled_independent_evaluation_failed',
      error: 'mass_distilled_evaluation_judge_unavailable',
    }, '2026-09-17T22:56:45Z'),
  ]

  const decision = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifact],
    events,
    now: new Date('2026-09-17T22:57:00Z'),
  })

  assert.equal(decision.issue, true)
  if (!decision.issue) return
  assert.equal(decision.artifact.candidateId, candidateId)
  assert.equal(decision.evidence.priorFailedAttempts, 0)
  assert.equal(decision.evidence.maxJudgeCalls, 4)
  assert.equal(decision.evidence.maxEndpointCalls, 8)
  assert.equal(decision.evidence.productionTrafficAuthorized, false)
})
