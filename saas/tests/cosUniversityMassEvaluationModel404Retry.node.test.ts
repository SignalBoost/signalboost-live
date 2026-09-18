// saas/tests/cosUniversityMassEvaluationModel404Retry.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
  decideRollingMassEvaluationApproval,
  type RollingEvent,
} from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'

const hash = '7f23dde56e39a6bc0b279843ec31980a0c4a3c6c4b46975a24128dfd4caab976'
const artifact = { candidateId: 'mass:cs:404', subjectId: 'Computer Science & Coding', artifactHash: hash, createdAt: '2026-09-15T00:00:00Z' }
const now = new Date('2026-09-17T01:00:00Z')
const event = (verifier: string, evidence: Record<string, unknown>, observedAt: string, expiresAt: string | null = null): RollingEvent => ({ candidateId: artifact.candidateId, verifier, evidence, observedAt, expiresAt })
const canary = event('host_production_verifier', { claim: 'production_canary_healthy', artifactHash: hash, exactArtifact: true, productionTrafficAuthorized: false }, '2026-09-16T03:03:00Z')
const approval = event('host_controller', { claim: 'distilled_independent_evaluation_approved', artifactHash: hash, authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF }, '2026-09-17T00:40:00Z', '2026-09-17T02:40:00Z')
const started = event('host_controller', { claim: 'mass_distilled_independent_evaluation_started', artifactHash: hash }, '2026-09-17T00:40:01Z')
const staleModel404 = 'mass_distilled_evaluation_runpod_http_404:candidate:cases=4:{"error":{"message":"The model `itmounts-mass-distilled-7f23dde56e39` does not exist.","code":404}}'

test('three pre-fix hash-only model 404s remain retryable because they are evaluator identity drift', () => {
  const failures = [41, 44, 52].map(minute => event('host_controller', { claim: 'mass_distilled_independent_evaluation_failed', artifactHash: hash, error: staleModel404 }, `2026-09-17T00:${minute}:00Z`))
  const decision = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifact], events: [canary, approval, started, ...failures], now })
  assert.equal(decision.issue, true)
  if (decision.issue) assert.equal(decision.evidence.priorFailedAttempts, 0)
})

test('unrelated candidate 404s are not broadly reclassified', () => {
  const failure = event('host_controller', { claim: 'mass_distilled_independent_evaluation_failed', artifactHash: hash, error: 'mass_distilled_evaluation_runpod_http_404:candidate:cases=4:other missing resource' }, '2026-09-17T00:52:00Z')
  const decision = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifact], events: [canary, approval, started, failure], now })
  assert.equal(decision.issue, true)
  if (decision.issue) assert.equal(decision.evidence.priorFailedAttempts, 1)
})
