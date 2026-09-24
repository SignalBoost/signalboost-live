// saas/tests/cosUniversityMassCanaryArtifactDailyCap.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MASS_CANARY_APPROVAL_CLAIM,
  MASS_CANARY_PROFILE,
  MASS_CANARY_ROLLING_AUTHORIZATION_REF,
  MASS_CANARY_NO_WORKER_FAILURE,
  MASS_CANARY_MAX_INVOCATIONS_PER_ARTIFACT_PER_DAY,
  decideMassCanaryRollingApproval,
  type CanaryArtifact,
  type CanaryEvent,
} from '../lib/ai/cos/cosUniversityMassCanaryRollingAuthority.ts'

const now = new Date('2026-09-24T19:20:00.000Z')
const h = (n: number) => n.toString(16).padStart(64, '0')
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString()

// Priority artifact (remediation-replay proof lane) that keeps failing only with infrastructure errors.
const stuck: CanaryArtifact = {
  candidateId: 'mass:stuck',
  subjectId: 'Law, Regulation & Governance',
  artifactHash: h(1),
  createdAt: '2026-09-24T10:00:00.000Z',
  failureDerivedReplayRequired: true,
  failureDerivedReplayItems: 3,
}
const waiting: CanaryArtifact = {
  candidateId: 'mass:waiting',
  subjectId: 'Mathematics',
  artifactHash: h(2),
  createdAt: '2026-09-14T00:00:00.000Z',
}

const ev = (a: CanaryArtifact, claim: string, observedAt: string, evidence: Record<string, unknown> = {}): CanaryEvent => ({
  candidateId: a.candidateId,
  observedAt,
  expiresAt: claim === MASS_CANARY_APPROVAL_CLAIM ? new Date(Date.parse(observedAt) + 2 * 3600_000).toISOString() : null,
  verifier: 'host_controller',
  evidence: { profile: MASS_CANARY_PROFILE, claim, artifactHash: a.artifactHash, ...evidence },
})

/** One full approved -> invoked -> infrastructure-failed attempt. */
function attempt(a: CanaryArtifact, startedMinutesAgo: number): CanaryEvent[] {
  return [
    ev(a, MASS_CANARY_APPROVAL_CLAIM, minutesAgo(startedMinutesAgo), { authorizationRef: MASS_CANARY_ROLLING_AUTHORIZATION_REF }),
    ev(a, 'local_distilled_runtime_canary_invocation_started', minutesAgo(startedMinutesAgo - 0.1)),
    ev(a, 'local_distilled_runtime_canary_failed', minutesAgo(startedMinutesAgo - 6), { error: MASS_CANARY_NO_WORKER_FAILURE }),
  ]
}

test('the Production loop shape: a priority artifact with 3 infrastructure-failed invocations today yields the lane', () => {
  assert.equal(MASS_CANARY_MAX_INVOCATIONS_PER_ARTIFACT_PER_DAY, 3)
  const events = [...attempt(stuck, 300), ...attempt(stuck, 200), ...attempt(stuck, 100)]
  const decision = decideMassCanaryRollingApproval({ artifacts: [stuck, waiting], events, now, enabled: true })
  assert.ok('artifact' in decision)
  assert.equal(decision.artifact.candidateId, 'mass:waiting')
})

test('below the daily ceiling the priority artifact keeps its place in the queue', () => {
  const events = [...attempt(stuck, 300), ...attempt(stuck, 100)]
  const decision = decideMassCanaryRollingApproval({ artifacts: [stuck, waiting], events, now, enabled: true })
  assert.ok('artifact' in decision)
  assert.equal(decision.artifact.candidateId, 'mass:stuck')
})

test('the capped artifact becomes eligible again automatically after a day', () => {
  const events = [...attempt(stuck, 1500), ...attempt(stuck, 1480), ...attempt(stuck, 1460)]
  const decision = decideMassCanaryRollingApproval({ artifacts: [stuck, waiting], events, now, enabled: true })
  assert.ok('artifact' in decision)
  assert.equal(decision.artifact.candidateId, 'mass:stuck')
})

test('the daily ceiling never issues an approval when every artifact is capped', () => {
  const events = [
    ...attempt(stuck, 300), ...attempt(stuck, 200), ...attempt(stuck, 100),
    ...attempt(waiting, 290), ...attempt(waiting, 190), ...attempt(waiting, 90),
  ]
  const decision = decideMassCanaryRollingApproval({ artifacts: [stuck, waiting], events, now, enabled: true })
  assert.equal(decision.issue, false)
  if (decision.issue === false) assert.equal(decision.reason, 'no_mass_artifact_eligible_for_rolling_canary')
})
