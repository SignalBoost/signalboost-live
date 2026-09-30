//
// Owner query 2026-09-30 (the exam lane's last 8 decisions): 4 of 8 ended on mass_distilled_runtime_endpoint_id_missing.
// The student's RunPod endpoint no longer existed, nothing ever re-canaried it, so it was retried forever and took exam
// turns from students that could sit the exam. A deleted endpoint now sends the student back to the canary lane for a
// fresh endpoint, and the exam lane passes over it until that fresh canary exists.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MASS_CANARY_PROFILE,
  canaryEndpointRetired,
  decideMassCanaryRollingApproval,
  evaluationEndpointMissing,
  type CanaryArtifact,
  type CanaryEvent,
} from '../lib/ai/cos/cosUniversityMassCanaryRollingAuthority.ts'
import { MASS_EVALUATION_ROLLING_AUTHORIZATION_REF, decideRollingMassEvaluationApproval } from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'

const EXAM_PROFILE = 'cos_mass_distilled_independent_evaluation_runtime_v1'
const MISSING = 'mass_distilled_runtime_endpoint_id_missing'
const h = (n: number) => n.toString(16).padStart(64, '0')

// ---- canary lane -------------------------------------------------------------------------------------------------
const canaryNow = new Date('2026-09-30T05:30:00.000Z')
const student = (n: number, createdAt = '2026-09-29T00:00:00.000Z'): CanaryArtifact =>
  ({ candidateId: `mass:${n}`, subjectId: 'History', artifactHash: h(n), createdAt })
const canaryEvent = (a: CanaryArtifact, claim: string, observedAt: string, evidence: Record<string, unknown> = {}): CanaryEvent =>
  ({ candidateId: a.candidateId, observedAt, expiresAt: null, verifier: 'host_controller', evidence: { profile: MASS_CANARY_PROFILE, claim, artifactHash: a.artifactHash, ...evidence } })

test('an exam that cannot find the endpoint re-canaries the student after the FIRST such failure', () => {
  assert.equal(evaluationEndpointMissing(`${MISSING}:recovery_from=abc`), true)
  assert.equal(evaluationEndpointMissing('mass_distilled_evaluation_runtime_not_ready:network'), false)
  const a = student(1, '2026-09-28T00:00:00.000Z'); const b = student(2)
  const events = [
    canaryEvent(a, 'local_distilled_runtime_canary_passed', '2026-09-29T10:00:00.000Z', { endpointId: 'oldendpoint1' }),
    canaryEvent(a, 'mass_distilled_independent_evaluation_failed', '2026-09-30T05:21:36.000Z', { profile: EXAM_PROFILE, error: MISSING }),
  ]
  const decision: any = decideMassCanaryRollingApproval({ artifacts: [a, b], events, now: canaryNow, enabled: true })
  assert.equal(decision.artifact.candidateId, 'mass:1', 'the stuck student is re-canaried first, not skipped forever')
  assert.equal(decision.evidence.endpointRefresh, true)
})

test('a student whose endpoint our cleanup deleted is re-canaried before the exam wastes a turn on it', () => {
  const a = student(3, '2026-09-28T00:00:00.000Z'); const b = student(4)
  const passed = canaryEvent(a, 'local_distilled_runtime_canary_passed', '2026-09-29T10:00:00.000Z', { endpointId: 'goneendpoint' })
  const retired = canaryEvent(a, 'local_distilled_runtime_endpoint_retired', '2026-09-30T04:00:00.000Z', { endpointId: 'goneendpoint', endpointRetired: true })
  assert.equal(canaryEndpointRetired([retired], 'GONEENDPOINT'), true)
  const decision: any = decideMassCanaryRollingApproval({ artifacts: [a, b], events: [passed, retired], now: canaryNow, enabled: true })
  assert.equal(decision.artifact.candidateId, 'mass:3')
  assert.equal(decision.evidence.endpointRefresh, true)
  const fresh = canaryEvent(a, 'local_distilled_runtime_canary_passed', '2026-09-30T05:10:00.000Z', { endpointId: 'freshendpoint' })
  const after: any = decideMassCanaryRollingApproval({ artifacts: [a, b], events: [passed, retired, fresh], now: canaryNow, enabled: true })
  assert.equal(after.artifact.candidateId, 'mass:4', 'once it has a fresh endpoint it waits for its exam like everyone else')
})

// ---- exam lane ---------------------------------------------------------------------------------------------------
const examNow = new Date('2026-09-30T05:30:00.000Z')
const examStudent = (n: number) => ({ candidateId: `mass:e${n}`, subjectId: 'History', artifactHash: h(100 + n), createdAt: '2026-09-29T00:00:00.000Z' }) as any
const examEvent = (s: any, claim: string, observedAt: string, evidence: Record<string, unknown> = {}, verifier = 'host_controller') =>
  ({ candidateId: s.candidateId, observedAt, expiresAt: null, verifier, evidence: { profile: EXAM_PROFILE, claim, artifactHash: s.artifactHash, ...evidence } }) as any
const healthy = (s: any, observedAt: string, endpointId: string) => examEvent(s, 'production_canary_healthy', observedAt, {
  profile: 'cos_university_fine_tune_evidence_v1', exactArtifact: true, internalVllmReady: true, productionTrafficAuthorized: false,
  authorityExpanded: false, endpointId, attentionArchitecture: 'standard_attention',
}, 'host_production_verifier')

test('the exam lane passes over a student whose endpoint is gone and examines the next one instead', () => {
  const stuck = examStudent(1); const ready = examStudent(2)
  const events = [
    healthy(stuck, '2026-09-29T12:00:00.000Z', 'goneendpoint'),
    examEvent(stuck, 'distilled_independent_evaluation_approved', '2026-09-30T05:00:00.000Z', { profile: 'cos_distilled_independent_evaluation_authorization_v1', authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF }),
    examEvent(stuck, 'mass_distilled_independent_evaluation_failed', '2026-09-30T05:05:00.000Z', { error: MISSING }),
    healthy(ready, '2026-09-29T13:00:00.000Z', 'liveendpoint'),
  ]
  const decision: any = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [stuck, ready], events, now: examNow })
  assert.equal(decision.issue, true)
  assert.equal(decision.artifact.candidateId, 'mass:e2')

  const onlyStuck: any = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [stuck], events, now: examNow })
  assert.equal(onlyStuck.issue, false)
  assert.equal(onlyStuck.skipped?.endpoint_gone_awaiting_fresh_canary, 1)

  const refreshed: any = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [stuck], events: [...events, healthy(stuck, '2026-09-30T05:20:00.000Z', 'freshendpoint')], now: examNow })
  assert.equal(refreshed.skipped?.endpoint_gone_awaiting_fresh_canary, undefined, 'a fresh canary releases it to the exam')
})

test('an endpoint our cleanup deleted holds the student even before a failed exam proves it', () => {
  const s = examStudent(3)
  const retired = examEvent(s, 'local_distilled_runtime_endpoint_retired', '2026-09-30T04:00:00.000Z', { profile: MASS_CANARY_PROFILE, endpointId: 'goneendpoint', endpointRetired: true })
  const decision: any = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [s], events: [healthy(s, '2026-09-29T12:00:00.000Z', 'goneendpoint'), retired], now: examNow })
  assert.equal(decision.issue, false)
  assert.equal(decision.skipped?.endpoint_gone_awaiting_fresh_canary, 1)
})