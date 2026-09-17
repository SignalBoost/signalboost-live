// saas/tests/cosUniversityMassEvaluationRollingAuthority.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT,
  MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
  MASS_EVALUATION_ROLLING_MAX_APPROVALS,
  decideRollingMassEvaluationApproval,
  type RollingEvent,
} from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'

const now = new Date('2026-09-16T16:50:00Z')
const hashA = '7f23dde5'.padEnd(64, 'a')
const hashB = '8cea7b8f'.padEnd(64, 'b')
const artifactA = { candidateId: 'mass:cs:1', subjectId: 'Computer Science & Coding', artifactHash: hashA, createdAt: '2026-09-15T22:34:00Z' }
const artifactB = { candidateId: 'mass:cyber:1', subjectId: 'Cybersecurity', artifactHash: hashB, createdAt: '2026-09-15T18:26:00Z' }
const ev = (candidateId: string, verifier: string, evidence: Record<string, unknown>, observedAt = '2026-09-16T10:00:00Z', expiresAt: string | null = null): RollingEvent => ({ candidateId, verifier, evidence, observedAt, expiresAt })
const canary = (a: typeof artifactA) => ev(a.candidateId, 'host_production_verifier', { claim: 'production_canary_healthy', artifactHash: a.artifactHash, exactArtifact: true, productionTrafficAuthorized: false })

test('issues exactly the claim-compatible shape for a canary-proven artifact past the 12h retention delay', () => {
  const decision = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifactA], events: [canary(artifactA)], now })
  assert.equal(decision.issue, true)
  if (!decision.issue) return
  assert.equal(decision.evidence.maxEndpointCalls, 8)
  assert.equal(decision.evidence.maxJudgeCalls, 4)
  assert.equal(decision.evidence.maxRuntimeWakeAttempts, 1)
  assert.equal(decision.evidence.maxEstimatedRuntimeWakeCostUsd, 0.2)
  assert.equal(decision.evidence.productionTrafficAuthorized, false)
  assert.equal(decision.evidence.authorityExpanded, false)
  assert.equal(decision.evidence.authorizationRef, MASS_EVALUATION_ROLLING_AUTHORIZATION_REF)
})

test('no canary, too fresh, disabled, or already has a verdict means no approval', () => {
  assert.equal(decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifactA], events: [], now }).issue, false)
  assert.equal(decideRollingMassEvaluationApproval({ enabled: true, artifacts: [{ ...artifactA, createdAt: '2026-09-16T10:00:00Z' }], events: [canary(artifactA)], now }).issue, false)
  assert.equal(decideRollingMassEvaluationApproval({ enabled: false, artifacts: [artifactA], events: [canary(artifactA)], now }).issue, false)
  const verdict = ev(artifactA.candidateId, 'independent_scorer', { claim: 'independent_evaluation', artifactHash: hashA })
  assert.equal(decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifactA], events: [canary(artifactA), verdict], now }).issue, false)
})

test('an armed approval or an owner suspension blocks a new one; a consumed approval does not', () => {
  const armed = ev(artifactA.candidateId, 'host_controller', { claim: 'distilled_independent_evaluation_approved', artifactHash: hashA }, '2026-09-16T16:37:00Z', '2026-09-16T18:37:00Z')
  assert.equal(decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifactA], events: [canary(artifactA), armed], now }).issue, false)
  const started = ev(artifactA.candidateId, 'host_controller', { claim: 'mass_distilled_independent_evaluation_started', artifactHash: hashA }, '2026-09-16T16:40:21Z')
  const failed = ev(artifactA.candidateId, 'host_controller', { claim: 'mass_distilled_independent_evaluation_failed', artifactHash: hashA }, '2026-09-16T16:43:00Z')
  assert.equal(decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifactA], events: [canary(artifactA), armed, started, failed], now }).issue, true)
  const suspended = ev(artifactA.candidateId, 'host_controller', { claim: 'distilled_independent_evaluation_suspended', artifactHash: hashA }, '2026-09-16T16:45:00Z')
  assert.equal(decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifactA], events: [canary(artifactA), armed, started, failed, suspended], now }).issue, false)
})

test('the repaired 502 diagnostic suspension may resume only through the bounded post-2398 rolling approval', () => {
  const suspended = ev(artifactA.candidateId, 'host_controller', {
    claim: 'distilled_independent_evaluation_suspended',
    artifactHash: hashA,
    reason: 'candidate_502_pending_runpod_worker_logs',
  }, '2026-09-16T16:45:00Z')
  const decision = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifactA], events: [canary(artifactA), suspended], now })
  assert.equal(decision.issue, true)
  if (!decision.issue) return
  assert.equal(decision.evidence.resumeAfterSuspension, true)
  assert.equal(decision.evidence.repairRef, 'pr_2398_24gb_evaluator_preflight')
  assert.equal(decision.evidence.maxEndpointCalls, 8)
  assert.equal(decision.evidence.maxEstimatedRuntimeWakeCostUsd, 0.2)
  assert.equal(decision.evidence.productionTrafficAuthorized, false)
})

test('three substantive failures of rolling attempts stop automatic retries, and the next eligible artifact is chosen oldest first', () => {
  const rollingApproval = ev(artifactB.candidateId, 'host_controller', { claim: 'distilled_independent_evaluation_approved', artifactHash: hashB, authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF }, '2026-09-16T09:00:00Z', '2026-09-16T11:00:00Z')
  const failures = Array.from({ length: MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT }, (_, i) =>
    ev(artifactB.candidateId, 'host_controller', { claim: 'mass_distilled_independent_evaluation_failed', artifactHash: hashB, error: 'mass_distilled_evaluation_judge_json_invalid' }, `2026-09-16T1${i}:00:00Z`))
  const decision = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifactA, artifactB], events: [canary(artifactA), canary(artifactB), rollingApproval, ...failures], now })
  assert.equal(decision.issue && decision.artifact.candidateId, artifactA.candidateId)
})

test('evaluator infrastructure failures do not exhaust the artifact retry budget', () => {
  const rollingApproval = ev(artifactA.candidateId, 'host_controller', { claim: 'distilled_independent_evaluation_approved', artifactHash: hashA, authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF }, '2026-09-16T09:00:00Z', '2026-09-16T11:00:00Z')
  const failures = [
    'mass_distilled_evaluation_context_budget_insufficient:cases=8:estimatedPromptTokens=9138',
    "mass_distilled_evaluation_runpod_http_400:baseline:cases=8:{\"error\":{\"message\":\"This model's maximum context length is 8192 tokens\"}}",
    'The operation was aborted due to timeout',
    'mass_distilled_evaluation_runpod_http_502:baseline:cases=4:gateway',
    'mass_distilled_evaluation_answer_missing:0a546e1b26656083',
  ].map((error, i) => ev(artifactA.candidateId, 'host_controller', { claim: 'mass_distilled_independent_evaluation_failed', artifactHash: hashA, error }, `2026-09-16T1${i}:00:00Z`))
  const decision = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifactA], events: [canary(artifactA), rollingApproval, ...failures], now })
  assert.equal(decision.issue, true)
  if (decision.issue) assert.equal(decision.evidence.priorFailedAttempts, 0)
})

test('failures of earlier hand-approved attempts do not use up the automatic retry budget', () => {
  const handFailures = Array.from({ length: 3 }, (_, i) =>
    ev(artifactA.candidateId, 'host_controller', { claim: 'mass_distilled_independent_evaluation_failed', artifactHash: hashA }, `2026-09-16T1${i}:43:00Z`))
  const decision = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifactA], events: [canary(artifactA), ...handFailures], now })
  assert.equal(decision.issue, true)
})

test('the rolling window caps approvals per 24 hours', () => {
  const issued = Array.from({ length: MASS_EVALUATION_ROLLING_MAX_APPROVALS }, (_, i) =>
    ev(`mass:x:${i}`, 'host_controller', { claim: 'distilled_independent_evaluation_approved', authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF, artifactHash: 'c'.repeat(64) }, '2026-09-16T12:00:00Z'))
  const decision = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifactA], events: [canary(artifactA), ...issued], now })
  assert.equal(decision.issue, false)
  assert.equal(!decision.issue && decision.reason, 'rolling_mass_evaluation_window_exhausted')
})

test('infrastructure-failed approvals are released from the rolling window while in-flight approvals still count', () => {
  const infraEvents: RollingEvent[] = []
  for (let i = 0; i < MASS_EVALUATION_ROLLING_MAX_APPROVALS; i++) {
    const candidateId = `mass:infra:${i}`
    const minute = String(i).padStart(2, '0')
    infraEvents.push(ev(candidateId, 'host_controller', { claim: 'distilled_independent_evaluation_approved', authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF, artifactHash: 'd'.repeat(64) }, `2026-09-16T12:${minute}:00Z`, `2026-09-16T14:${minute}:00Z`))
    infraEvents.push(ev(candidateId, 'host_controller', { claim: 'mass_distilled_independent_evaluation_started', artifactHash: 'd'.repeat(64) }, `2026-09-16T12:${minute}:10Z`))
    infraEvents.push(ev(candidateId, 'host_controller', { claim: 'mass_distilled_independent_evaluation_failed', artifactHash: 'd'.repeat(64), error: i % 2 ? 'mass_distilled_evaluation_runpod_http_502:candidate:cases=4:gateway' : 'mass_distilled_evaluation_answer_missing:case' }, `2026-09-16T12:${minute}:20Z`))
  }
  const decision = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifactA], events: [canary(artifactA), ...infraEvents], now })
  assert.equal(decision.issue, true)

  const armed = Array.from({ length: MASS_EVALUATION_ROLLING_MAX_APPROVALS }, (_, i) =>
    ev(`mass:armed:${i}`, 'host_controller', { claim: 'distilled_independent_evaluation_approved', authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF, artifactHash: 'e'.repeat(64) }, '2026-09-16T12:00:00Z', '2026-09-16T18:00:00Z'))
  const blocked = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifactA], events: [canary(artifactA), ...armed], now })
  assert.equal(blocked.issue, false)
  assert.equal(!blocked.issue && blocked.reason, 'rolling_mass_evaluation_window_exhausted')
})

test('the cron issues at most one approval before the unchanged atomic claim, with an env kill switch', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')
  assert.ok(route.indexOf('await ensureRollingMassEvaluationApproval()') < route.indexOf('claim = await claimNext()'))
  assert.match(route, /enabled: process\.env\.COS_MASS_EVALUATION_ROLLING_AUTHORIZATION !== 'false'/)
  assert.match(route, /verifier: 'host_controller'/)
  assert.match(route, /db\.rpc\('claim_next_mass_distilled_evaluation'\)/)
})

test('an event returned by both cron reads is counted once, so two real failures cannot trip the three-failure stop', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')
  assert.equal((route.match(/\.select\('event_key,candidate_id,observed_at,expires_at,verifier,evidence'\)/g) || []).length, 2)
  assert.match(route, /seenEventKeys\.has\(key\)/)
  assert.match(route, /const all: RollingEvent\[\] = uniqueRows\.map/)
})
