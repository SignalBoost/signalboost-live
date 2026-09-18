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
  candidateId: 'mass:shadow-approval:1',
  subjectId: 'computer_science',
  artifactHash: hash,
  createdAt: '2026-09-16T08:00:00Z',
}
const ev = (claim: string, observedAt: string, expiresAt: string | null = null, extra: Record<string, unknown> = {}): RollingEvent => ({
  candidateId: artifact.candidateId,
  verifier: claim === 'production_canary_healthy' ? 'host_production_verifier' : 'host_controller',
  observedAt,
  expiresAt,
  evidence: { claim, artifactHash: hash, ...extra },
})
const approval = (observedAt: string, expiresAt: string) => ev('distilled_independent_evaluation_approved', observedAt, expiresAt, {
  authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
})

test('shadow approvals during live infrastructure-failed runs do not exhaust the rolling window', () => {
  const events: RollingEvent[] = [ev('production_canary_healthy', '2026-09-17T20:00:00Z', null, { exactArtifact: true, productionTrafficAuthorized: false })]
  for (let i = 0; i < MASS_EVALUATION_ROLLING_MAX_APPROVALS; i += 2) {
    const minute = String(i).padStart(2, '0')
    const shadowMinute = String(i + 1).padStart(2, '0')
    events.push(approval(`2026-09-17T21:${minute}:00Z`, `2026-09-17T21:${shadowMinute}:50Z`))
    events.push(ev('mass_distilled_independent_evaluation_started', `2026-09-17T21:${minute}:10Z`, `2026-09-17T21:${shadowMinute}:40Z`))
    events.push(approval(`2026-09-17T21:${shadowMinute}:00Z`, `2026-09-17T21:${shadowMinute}:30Z`))
    events.push(ev('mass_distilled_independent_evaluation_failed', `2026-09-17T21:${shadowMinute}:20Z`, null, { error: 'mass_distilled_evaluation_judge_unavailable' }))
  }
  const decision = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifact], events, now: new Date('2026-09-17T22:00:00Z') })
  assert.equal(decision.issue, true)
  if (decision.issue) assert.equal(decision.evidence.priorFailedAttempts, 0)
})

test('live started evaluation blocks a second rolling approval', () => {
  const events: RollingEvent[] = [
    ev('production_canary_healthy', '2026-09-17T20:00:00Z', null, { exactArtifact: true, productionTrafficAuthorized: false }),
    approval('2026-09-17T21:58:00Z', '2026-09-17T23:58:00Z'),
    ev('mass_distilled_independent_evaluation_started', '2026-09-17T21:58:10Z', '2026-09-17T22:10:10Z'),
  ]
  const decision = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifact], events, now: new Date('2026-09-17T22:00:00Z') })
  assert.deepEqual(decision, { issue: false, reason: 'no_mass_artifact_eligible_for_rolling_evaluation' })
})
