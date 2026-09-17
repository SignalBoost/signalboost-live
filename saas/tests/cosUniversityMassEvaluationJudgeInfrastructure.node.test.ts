import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
  decideRollingMassEvaluationApproval,
  type RollingEvent,
} from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'

const artifact = {
  candidateId: 'mass:judge-overload',
  subjectId: 'Computer Science & Coding',
  artifactHash: 'a'.repeat(64),
  createdAt: '2026-09-16T00:00:00Z',
}

const event = (observedAt: string, evidence: Record<string, unknown>, verifier = 'host_controller'): RollingEvent => ({
  candidateId: artifact.candidateId,
  observedAt,
  expiresAt: null,
  verifier,
  evidence: { artifactHash: artifact.artifactHash, ...evidence },
})

test('judge_unavailable is evaluator infrastructure, not a substantive artifact failure or rolling-window charge', () => {
  const events: RollingEvent[] = [
    event('2026-09-17T21:00:00Z', { claim: 'production_canary_healthy', exactArtifact: true, productionTrafficAuthorized: false }, 'host_production_verifier'),
    event('2026-09-17T22:52:33Z', {
      claim: 'distilled_independent_evaluation_approved',
      authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
    }),
    event('2026-09-17T22:52:34Z', { claim: 'mass_distilled_independent_evaluation_started' }),
    event('2026-09-17T22:56:45Z', {
      claim: 'mass_distilled_independent_evaluation_failed',
      error: 'mass_distilled_evaluation_judge_unavailable',
    }),
  ]

  const decision = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifact],
    events,
    now: new Date('2026-09-17T22:57:00Z'),
  })

  assert.equal(decision.issue, true)
  if (!decision.issue) return
  assert.equal(decision.evidence.priorFailedAttempts, 0)
  assert.equal(decision.evidence.maxJudgeCalls, 4)
  assert.equal(decision.evidence.authorityExpanded, false)
})
