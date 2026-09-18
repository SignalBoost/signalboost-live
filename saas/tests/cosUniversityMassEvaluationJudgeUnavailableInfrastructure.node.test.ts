import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
  MASS_EVALUATION_ROLLING_MAX_APPROVALS,
  decideRollingMassEvaluationApproval,
  type RollingEvent,
} from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'

const hash = 'a'.repeat(64)
const artifact = {
  candidateId: 'mass:judge-overload:1',
  subjectId: 'computer_science',
  artifactHash: hash,
  createdAt: '2026-09-16T08:00:00Z',
}
const ev = (candidateId: string, verifier: string, evidence: Record<string, unknown>, observedAt: string, expiresAt: string | null = null): RollingEvent => ({ candidateId, verifier, evidence, observedAt, expiresAt })

test('judge_unavailable releases approvals from the 24h window and artifact retry budget', () => {
  const events: RollingEvent[] = [
    ev(artifact.candidateId, 'host_production_verifier', { claim: 'production_canary_healthy', artifactHash: hash, exactArtifact: true, productionTrafficAuthorized: false }, '2026-09-17T20:00:00Z'),
  ]
  for (let i = 0; i < MASS_EVALUATION_ROLLING_MAX_APPROVALS; i++) {
    const minute = String(i).padStart(2, '0')
    events.push(ev(artifact.candidateId, 'host_controller', { claim: 'distilled_independent_evaluation_approved', artifactHash: hash, authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF }, `2026-09-17T21:${minute}:00Z`, `2026-09-17T23:${minute}:00Z`))
    events.push(ev(artifact.candidateId, 'host_controller', { claim: 'mass_distilled_independent_evaluation_started', artifactHash: hash }, `2026-09-17T21:${minute}:10Z`))
    events.push(ev(artifact.candidateId, 'host_controller', { claim: 'mass_distilled_independent_evaluation_failed', artifactHash: hash, error: i % 2 === 0 ? 'mass_distilled_evaluation_judge_unavailable' : 'mass_distilled_evaluation_judge_timeout:holdout' }, `2026-09-17T21:${minute}:20Z`))
  }
  const decision = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifact], events, now: new Date('2026-09-17T22:59:00Z') })
  assert.equal(decision.issue, true)
  if (decision.issue) assert.equal(decision.evidence.priorFailedAttempts, 0)
})
