// saas/tests/cosUniversityMassEvaluationStaleApproval.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
  decideRollingMassEvaluationApproval,
  type RollingEvent,
} from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'
import { MASS_EVALUATION_ENDPOINT_CALLS } from '../lib/ai/cos/cosUniversityMassEvaluationContextBudget.ts'

const hash = 'e'.repeat(64)
const artifact = { candidateId: 'mass:stale', subjectId: 'reasoning', artifactHash: hash, createdAt: '2026-09-17T06:00:00Z' }
const canary: RollingEvent = {
  candidateId: artifact.candidateId,
  observedAt: '2026-09-17T20:00:00Z',
  expiresAt: null,
  verifier: 'host_production_verifier',
  evidence: { claim: 'production_canary_healthy', artifactHash: hash, exactArtifact: true, productionTrafficAuthorized: false },
}
const approval = (maxEndpointCalls: number, observedAt: string, expiresAt: string): RollingEvent => ({
  candidateId: artifact.candidateId,
  observedAt,
  expiresAt,
  verifier: 'host_controller',
  evidence: {
    claim: 'distilled_independent_evaluation_approved',
    authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
    artifactHash: hash,
    maxEndpointCalls,
  },
})
const decide = (events: RollingEvent[], now: string) =>
  decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifact], events, now: new Date(now) })

test('an approval armed at a superseded ceiling no longer blocks a current one', () => {
  // Production 2026-09-18 00:36 UTC: 52 approvals armed at the old ceiling of 8, none claimable, newest valid to 01:32.
  const stale = approval(8, '2026-09-17T23:32:00Z', '2026-09-18T01:32:00Z')
  const decision = decide([canary, stale], '2026-09-18T00:36:00Z')
  assert.equal(decision.issue, true)
  if (!decision.issue) return
  assert.equal(decision.evidence.maxEndpointCalls, MASS_EVALUATION_ENDPOINT_CALLS)
})

test('an armed approval at the CURRENT ceiling still reserves the slot, as before', () => {
  const current = approval(MASS_EVALUATION_ENDPOINT_CALLS, '2026-09-17T23:32:00Z', '2026-09-18T01:32:00Z')
  const decision = decide([canary, current], '2026-09-18T00:36:00Z')
  assert.equal(decision.issue, false)
})

test('an expired current-ceiling approval still releases the slot, as before', () => {
  const expired = approval(MASS_EVALUATION_ENDPOINT_CALLS, '2026-09-17T20:30:00Z', '2026-09-17T22:30:00Z')
  const decision = decide([canary, expired], '2026-09-18T00:36:00Z')
  assert.equal(decision.issue, true)
})

test('releasing a dead approval grants no authority beyond the normal shape', () => {
  const stale = approval(8, '2026-09-17T23:32:00Z', '2026-09-18T01:32:00Z')
  const decision = decide([canary, stale], '2026-09-18T00:36:00Z')
  assert.equal(decision.issue, true)
  if (!decision.issue) return
  assert.equal(decision.evidence.maxJudgeCalls, 4)
  assert.equal(decision.evidence.maxRuntimeWakeAttempts, 1)
  assert.equal(decision.evidence.productionTrafficAuthorized, false)
  assert.equal(decision.evidence.authorityExpanded, false)
})
