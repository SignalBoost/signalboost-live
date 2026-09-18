// saas/tests/cosUniversityMassEvaluationRuntimeNotReady.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT,
  MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
  decideRollingMassEvaluationApproval,
  type RollingEvent,
} from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'

const now = new Date('2026-09-17T06:00:00Z')
const hash = '7f23dde5'.padEnd(64, 'a')
const artifact = { candidateId: 'mass:cs:1', subjectId: 'Computer Science & Coding', artifactHash: hash, createdAt: '2026-09-15T22:34:00Z' }
const ev = (verifier: string, evidence: Record<string, unknown>, observedAt: string, expiresAt: string | null = null): RollingEvent => ({ candidateId: artifact.candidateId, verifier, evidence, observedAt, expiresAt })
const canary = ev('host_production_verifier', { claim: 'production_canary_healthy', artifactHash: hash, exactArtifact: true, productionTrafficAuthorized: false }, '2026-09-16T10:00:00Z')
const rolling = ev('host_controller', { claim: 'distilled_independent_evaluation_approved', artifactHash: hash, authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF }, '2026-09-17T00:20:00Z', '2026-09-17T02:20:00Z')
const failures = (error: string) => Array.from({ length: MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT }, (_, i) =>
  ev('host_controller', { claim: 'mass_distilled_independent_evaluation_failed', artifactHash: hash, error }, `2026-09-17T0${i + 1}:00:00Z`))
const started = ev('host_controller', { claim: 'mass_distilled_independent_evaluation_started', artifactHash: hash }, '2026-09-17T00:21:00Z')

test('runtime-not-ready failures (worker never bound) do not exhaust the artifact retry budget', () => {
  for (const error of ['mass_distilled_evaluation_runtime_not_ready:network', 'mass_distilled_evaluation_runtime_not_ready:503']) {
    const decision = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifact], events: [canary, rolling, started, ...failures(error)], now })
    assert.equal(decision.issue, true, error)
    if (decision.issue) assert.equal(decision.evidence.priorFailedAttempts, 0)
  }
})

test('bootstrap failures still count, because a bad artifact can cause them', () => {
  const decision = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifact], events: [canary, rolling, started, ...failures('mass_distilled_evaluation_runtime_bootstrap_failed')], now })
  assert.equal(decision.issue, false)
})
