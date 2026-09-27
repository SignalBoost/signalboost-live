// saas/tests/cosUniversityMassEvaluationExhaustedDisposition.node.test.ts
//
// An artifact that spends its substantive attempt budget can never be approved again - only a hand-inserted
// reopen event releases it - but nothing ever moved it out of `evaluation_pending`. It stayed in the lane's
// selection window, which is the OLDEST 50 pending rows, so a run of dead artifacts at the front of the queue
// starves every newer artifact behind them while the lane reports them all as waiting.
//
// These tests pin what may be disposed and, more importantly, what may NOT: a retryable infrastructure
// failure, a live run, an artifact with a verdict, and anything still inside its budget all stay untouched.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  MASS_EVALUATION_EXHAUSTED_REASON,
  MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT,
  MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
  decideExhaustedMassEvaluationArtifacts,
  decideRollingMassEvaluationApproval,
  type RollingEvent,
} from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'
import { MASS_EVALUATION_ENDPOINT_CALLS } from '../lib/ai/cos/cosUniversityMassEvaluationContextBudget.ts'

const now = new Date('2026-09-20T12:00:00Z')
const hash = 'd90f1ab2'.padEnd(64, 'd')
const artifact = {
  candidateId: 'mass:law:3',
  subjectId: 'Law & Governance',
  artifactHash: hash,
  createdAt: '2026-09-19T00:00:00Z',
}

const ev = (
  verifier: string,
  evidence: Record<string, unknown>,
  observedAt: string,
  expiresAt: string | null = null,
): RollingEvent => ({ candidateId: artifact.candidateId, verifier, evidence, observedAt, expiresAt })

const canary = ev('host_production_verifier', {
  claim: 'production_canary_healthy',
  artifactHash: hash,
  exactArtifact: true,
  productionTrafficAuthorized: false,
}, '2026-09-19T01:00:00Z')

const approval = ev('host_controller', {
  claim: 'distilled_independent_evaluation_approved',
  artifactHash: hash,
  authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
  maxEndpointCalls: MASS_EVALUATION_ENDPOINT_CALLS,
}, '2026-09-20T09:00:00Z', '2026-09-20T09:05:00Z')

// Not in the infrastructure-failure list, so each of these spends a real attempt.
const SUBSTANTIVE = 'mass_distilled_evaluation_holdout_manifest_mismatch'
// In the infrastructure list: retryable by design, must never be disposed.
const INFRASTRUCTURE = 'mass_distilled_evaluation_runtime_not_ready:network'

function failed(error: string, count: number, startIso = '2026-09-20T10:00:00Z'): RollingEvent[] {
  const startMs = Date.parse(startIso)
  return Array.from({ length: count }, (_unused, index) => ev('host_controller', {
    claim: 'mass_distilled_independent_evaluation_failed',
    artifactHash: hash,
    error,
  }, new Date(startMs + index * 2 * 60_000).toISOString()))
}

const sweep = (events: readonly RollingEvent[]) =>
  decideExhaustedMassEvaluationArtifacts({ artifacts: [artifact], events, now })

test('an artifact that spent its substantive budget is named, with the reason and the last error', () => {
  const events = [canary, approval, ...failed(SUBSTANTIVE, MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT)]
  const exhausted = sweep(events)
  assert.equal(exhausted.length, 1)
  assert.equal(exhausted[0].candidateId, artifact.candidateId)
  assert.equal(exhausted[0].artifactHash, hash)
  assert.equal(exhausted[0].subjectId, artifact.subjectId)
  assert.equal(exhausted[0].reason, MASS_EVALUATION_EXHAUSTED_REASON)
  assert.equal(exhausted[0].failedAttempts, MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT)
  assert.equal(exhausted[0].lastError, SUBSTANTIVE)

  // The two decisions must agree: the approval policy refuses exactly what the sweep disposes.
  assert.equal(decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifact], events, now }).issue, false)
})

test('an artifact still inside its budget is left alone', () => {
  const events = [canary, approval, ...failed(SUBSTANTIVE, MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT - 1)]
  assert.equal(sweep(events).length, 0)
  // And it is still approvable, which is the point of leaving it alone.
  assert.equal(decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifact], events, now }).issue, true)
})

test('infrastructure failures are retryable and are never disposed, however many there are', () => {
  assert.equal(sweep([canary, approval, ...failed(INFRASTRUCTURE, 25)]).length, 0)
})

// 2026-09-27: mass:fce8f4ba was quarantined after three evaluation attempts in which RunPod's REST control plane
// returned HTTP 500 before any prompt reached the artifact. That is provider infrastructure, not model quality.
test('a RunPod control-plane 5xx or 429 never spends the substantive attempt budget', () => {
  const controlPlane = 'RunPod GET /serverless HTTP 500: failed to list endpoints'
  const events = [canary, approval, ...failed(controlPlane, MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT)]
  assert.equal(sweep(events).length, 0)
  for (const error of [
    'RunPod POST /endpoints HTTP 503: upstream unavailable',
    'RunPod PATCH /endpoints/abc HTTP 502',
    'RunPod GET /endpoints/abc HTTP 429: rate limited',
  ]) assert.equal(sweep([canary, approval, ...failed(error, 5)]).length, 0, error)
})

test('a RunPod client error is not reclassified as infrastructure', () => {
  const clientError = 'RunPod POST /endpoints HTTP 400: invalid template'
  assert.equal(sweep([canary, approval, ...failed(clientError, MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT)]).length, 1)
})

test('an artifact with a verdict or a live run is not disposed here', () => {
  const spent = failed(SUBSTANTIVE, MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT)

  const scored = ev('independent_scorer', { claim: 'independent_evaluation', artifactHash: hash }, '2026-09-20T11:00:00Z')
  assert.equal(sweep([canary, approval, ...spent, scored]).length, 0)

  const completed = ev('host_controller', { claim: 'mass_distilled_independent_evaluation_completed', artifactHash: hash }, '2026-09-20T11:00:00Z')
  assert.equal(sweep([canary, approval, ...spent, completed]).length, 0)

  const live = ev('host_controller', { claim: 'mass_distilled_independent_evaluation_started', artifactHash: hash }, '2026-09-20T11:55:00Z', '2026-09-20T12:30:00Z')
  assert.equal(sweep([canary, approval, ...spent, live]).length, 0)
})

test('failures recorded before the artifact ever had a rolling approval do not count', () => {
  const early = failed(SUBSTANTIVE, MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT, '2026-09-20T08:00:00Z')
  assert.equal(sweep([canary, ...early]).length, 0)
})

test('only well-formed mass artifacts are considered', () => {
  const events = [canary, approval, ...failed(SUBSTANTIVE, MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT)]
  assert.equal(decideExhaustedMassEvaluationArtifacts({
    artifacts: [{ ...artifact, candidateId: 'cos:law:3' }],
    events,
    now,
  }).length, 0)
  assert.equal(decideExhaustedMassEvaluationArtifacts({
    artifacts: [{ ...artifact, artifactHash: 'not-a-hash' }],
    events,
    now,
  }).length, 0)
})

test('the route disposes idempotently and writes the reason to the same ledger the evaluation uses', () => {
  const route = readFileSync(
    new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url),
    'utf8',
  )
  assert.match(route, /decideExhaustedMassEvaluationArtifacts/)
  // Status write is conditioned on the pending state, so re-running it changes nothing.
  assert.match(route, /\.update\(\{ status: 'quarantined', updated_at: now\.toISOString\(\) \}\)/)
  assert.match(route, /\.eq\('status', 'evaluation_pending'\)/)
  // Deterministic event key plus ignoreDuplicates: one disposition event per artifact, ever.
  assert.match(route, /event_key: hash\(\[PROFILE, EXHAUSTED, item\.candidateId, item\.artifactHash\]\)/)
  assert.match(route, /ignoreDuplicates: true/)
  // Disposal never asserts anything about Production traffic or expanded authority.
  assert.match(route, /productionTrafficAuthorized: false/)
  assert.match(route, /authorityExpanded: false/)
  // Disposed artifacts are removed from this tick's selection window.
  assert.match(route, /artifacts: remaining/)
})
