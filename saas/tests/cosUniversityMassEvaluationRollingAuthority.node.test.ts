// saas/tests/cosUniversityMassEvaluationRollingAuthority.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT,
  MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
  MASS_EVALUATION_JUDGE_ABSOLUTE_REPAIR_REF,
  MASS_EVALUATION_REOPEN_CLAIM,
  MASS_EVALUATION_ROLLING_MAX_APPROVALS,
  decideRollingMassEvaluationApproval,
  type RollingEvent,
} from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'
import { MASS_EVALUATION_ENDPOINT_CALLS } from '../lib/ai/cos/cosUniversityMassEvaluationContextBudget.ts'

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
  assert.equal(decision.evidence.maxEndpointCalls, MASS_EVALUATION_ENDPOINT_CALLS)
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
  assert.equal(decision.evidence.maxEndpointCalls, MASS_EVALUATION_ENDPOINT_CALLS)
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
    'mass_distilled_evaluation_endpoint_call_ceiling:0+2+15>14',
    "mass_distilled_evaluation_runpod_http_400:baseline:cases=8:{\"error\":{\"message\":\"This model's maximum context length is 8192 tokens\"}}",
    'The operation was aborted due to timeout',
    'mass_distilled_evaluation_runpod_http_502:baseline:cases=4:gateway',
    'mass_distilled_evaluation_answer_missing:0a546e1b26656083',
    'mass_distilled_evaluation_holdout_format_invalid',
    'mass_distilled_evaluation_legacy_hosted_prompt_binding_missing',
    'mass_distilled_evaluation_runtime_not_ready:204',
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

test('the cron may drain already-issued bounded approvals while preserving the authorization kill switch', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')
  const rolling = route.indexOf('await ensureRollingMassEvaluationApproval()')
  const drain = route.indexOf('const mayDrainExistingApproval')
  const denial = route.indexOf('if (!rolling.issued && !mayDrainExistingApproval)')
  const claim = route.indexOf('claim = await claimNext()')
  assert.ok(rolling >= 0 && drain > rolling && denial > drain && claim > denial)
  assert.match(route, /rolling\.reason === 'no_mass_artifact_eligible_for_rolling_evaluation'/)
  assert.match(route, /rolling\.reason === 'rolling_mass_evaluation_window_exhausted'/)
  assert.match(route, /if \(!rolling\.issued && !mayDrainExistingApproval\)/)
  assert.match(route, /enabled: process\.env\.COS_MASS_EVALUATION_ROLLING_AUTHORIZATION !== 'false'/)
  assert.match(route, /db\.rpc\('claim_next_mass_distilled_evaluation'\)/)
  assert.match(route, /maxEndpointCalls/)
  assert.match(route, /maxJudgeCalls/)
  assert.match(route, /maxRuntimeWakeAttempts/)
})

test('an event returned by both cron reads is counted once, so two real failures cannot trip the three-failure stop', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')
  assert.equal((route.match(/\.select\('event_key,candidate_id,observed_at,expires_at,verifier,evidence'\)/g) || []).length, 2)
  assert.match(route, /seenEventKeys\.has\(key\)/)
  assert.match(route, /const all: RollingEvent\[\] = uniqueRows\.map/)
})

test('an evaluator crash does not spend an artifact\'s substantive attempts', () => {
  // 2026-09-17: three attempts on mass:481a6760 were consumed by our own TypeError and by wake-contract errors,
  // leaving a healthy artifact permanently unevaluated.
  const artifact = { candidateId: 'mass:481a6760', subjectId: 'computer_science', artifactHash: 'b'.repeat(64), createdAt: '2026-09-16T10:00:00.000Z' }
  const approval = (observedAt: string) => ({
    candidateId: artifact.candidateId, observedAt, expiresAt: '2026-09-17T12:00:00.000Z', verifier: 'host_controller',
    evidence: { claim: 'distilled_independent_evaluation_approved', artifactHash: artifact.artifactHash, authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF },
  })
  const failure = (observedAt: string, error: string) => ({
    candidateId: artifact.candidateId, observedAt, expiresAt: null, verifier: 'host_controller',
    evidence: { claim: 'mass_distilled_independent_evaluation_failed', artifactHash: artifact.artifactHash, error },
  })
  const canary = {
    candidateId: artifact.candidateId, observedAt: '2026-09-17T17:27:00.000Z', expiresAt: null, verifier: 'host_production_verifier',
    evidence: { claim: 'production_canary_healthy', artifactHash: artifact.artifactHash, exactArtifact: true, productionTrafficAuthorized: false },
  }
  const events = [
    canary,
    approval('2026-09-17T20:01:00.000Z'), failure('2026-09-17T20:02:00.000Z', "Cannot read properties of undefined (reading 'length')"),
    approval('2026-09-17T20:10:00.000Z'), failure('2026-09-17T20:11:00.000Z', "Cannot read properties of undefined (reading 'length')"),
    approval('2026-09-17T20:20:00.000Z'), failure('2026-09-17T20:21:00.000Z', 'mass_distilled_evaluation_runtime_wake_http_404:{"detail":"Not Found"}'),
  ]
  const decision = decideRollingMassEvaluationApproval({
    artifacts: [artifact], events, now: new Date('2026-09-17T20:40:00.000Z'), enabled: true,
  } as Parameters<typeof decideRollingMassEvaluationApproval>[0])
  assert.ok('artifact' in decision, `expected a new approval, got ${JSON.stringify(decision)}`)
  assert.equal(decision.artifact.candidateId, 'mass:481a6760')
})

test('the same infrastructure failure repeating on one artifact stops instead of looping', () => {
  // mass:8f5af666, 2026-09-17 21:06-21:12 UTC: one truncated case reproduced every two minutes, waking paid compute.
  const artifact = { candidateId: 'mass:8f5af666', subjectId: 'economics_finance', artifactHash: 'd'.repeat(64), createdAt: '2026-09-14T19:12:00.000Z' }
  const canary = {
    candidateId: artifact.candidateId, observedAt: '2026-09-16T10:00:00.000Z', expiresAt: null, verifier: 'host_production_verifier',
    evidence: { claim: 'production_canary_healthy', artifactHash: artifact.artifactHash, exactArtifact: true, productionTrafficAuthorized: false },
  }
  const failure = (minute: number, error: string) => ({
    candidateId: artifact.candidateId, observedAt: `2026-09-17T21:${String(minute).padStart(2, '0')}:00.000Z`, expiresAt: null, verifier: 'host_controller',
    evidence: { claim: 'mass_distilled_independent_evaluation_failed', artifactHash: artifact.artifactHash, error },
  })
  const truncated = 'mass_distilled_evaluation_answer_missing:0ee6ecdba3940d76:finish=length'
  const now = new Date('2026-09-17T21:20:00.000Z')
  const repeated = [canary, failure(6, truncated), failure(8, truncated), failure(10, truncated), failure(12, truncated)]
  assert.deepEqual(
    decideRollingMassEvaluationApproval({ artifacts: [artifact], events: repeated, now, enabled: true } as Parameters<typeof decideRollingMassEvaluationApproval>[0]),
    { issue: false, reason: 'no_mass_artifact_eligible_for_rolling_evaluation' },
  )
  // Three identical failures still retry, and a different newest failure resets the count.
  const three = [canary, failure(6, truncated), failure(8, truncated), failure(10, truncated)]
  assert.ok('artifact' in decideRollingMassEvaluationApproval({ artifacts: [artifact], events: three, now, enabled: true } as Parameters<typeof decideRollingMassEvaluationApproval>[0]))
  const different = [...repeated, failure(14, 'mass_distilled_evaluation_runtime_not_ready:network')]
  assert.ok('artifact' in decideRollingMassEvaluationApproval({ artifacts: [artifact], events: different, now, enabled: true } as Parameters<typeof decideRollingMassEvaluationApproval>[0]))
})


test('RunPod max-worker quota preflight failures do not consume the paid evaluation rolling window', () => {
  const infraEvents: RollingEvent[] = []
  for (let i = 0; i < MASS_EVALUATION_ROLLING_MAX_APPROVALS; i++) {
    const candidateId = `mass:quota:${i}`
    const minute = String(i).padStart(2, '0')
    const artifactHash = 'f'.repeat(64)
    infraEvents.push(ev(candidateId, 'host_controller', {
      claim: 'distilled_independent_evaluation_approved',
      authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
      artifactHash,
    }, `2026-09-16T12:${minute}:00Z`, `2026-09-16T14:${minute}:00Z`))
    infraEvents.push(ev(candidateId, 'host_controller', {
      claim: 'mass_distilled_independent_evaluation_started',
      artifactHash,
    }, `2026-09-16T12:${minute}:10Z`, `2026-09-16T14:${minute}:10Z`))
    infraEvents.push(ev(candidateId, 'host_controller', {
      claim: 'mass_distilled_independent_evaluation_failed',
      artifactHash,
      error: 'RunPod PATCH /serverless/example HTTP 400: Max workers across all endpoints must not exceed your workers quota (10).',
    }, `2026-09-16T12:${minute}:20Z`))
  }
  const decision = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifactA],
    events: [canary(artifactA), ...infraEvents],
    now,
  })
  assert.equal(decision.issue, true)
})


test('unknown or disabled rolling denial still exits before atomic claim, but armed queue states reach the claim path', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')
  const denial = route.indexOf('if (!rolling.issued && !mayDrainExistingApproval)')
  const claim = route.indexOf('claim = await claimNext()')
  const preflight = route.indexOf('ensureMassDistilledEndpoint24Gb(claim.endpointId)')
  const wake = route.indexOf('wakeMassDistilledRuntime(claim.endpointId')
  assert.ok(denial >= 0 && claim > denial && preflight > claim && wake > preflight)
  assert.match(route, /return NextResponse\.json\(\{ ok: true, skipped: true, reason: rolling\.reason \}\)/)
  assert.match(route, /mayDrainExistingApproval = !rolling\.issued/)
  assert.doesNotMatch(route, /rolling\.reason === 'rolling_mass_evaluation_authorization_disabled'\s*\|\|/)
})


test('holdout format failures are evaluator infrastructure and do not consume model retry or rolling-window authority', () => {
  const approval = ev(artifactA.candidateId, 'host_controller', {
    claim: 'distilled_independent_evaluation_approved',
    authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
    artifactHash: hashA,
  }, '2026-09-16T12:00:00Z', '2026-09-16T14:00:00Z')
  const started = ev(artifactA.candidateId, 'host_controller', {
    claim: 'mass_distilled_independent_evaluation_started',
    artifactHash: hashA,
  }, '2026-09-16T12:00:10Z', '2026-09-16T12:12:10Z')
  const failed = ev(artifactA.candidateId, 'host_controller', {
    claim: 'mass_distilled_independent_evaluation_failed',
    artifactHash: hashA,
    error: 'mass_distilled_evaluation_holdout_format_invalid',
  }, '2026-09-16T12:00:20Z')
  const decision = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifactA],
    events: [canary(artifactA), approval, started, failed],
    now,
  })
  assert.equal(decision.issue, true)
  if (decision.issue) assert.equal(decision.evidence.priorFailedAttempts, 0)
})


test('moving-head holdout revision failures are evaluator infrastructure and release rolling authority', () => {
  const approval = ev(artifactA.candidateId, 'host_controller', {
    claim: 'distilled_independent_evaluation_approved',
    authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
    artifactHash: hashA,
  }, '2026-09-20T08:29:00Z', '2026-09-20T10:29:00Z')
  const started = ev(artifactA.candidateId, 'host_controller', {
    claim: 'mass_distilled_independent_evaluation_started',
    artifactHash: hashA,
  }, '2026-09-20T08:29:10Z', '2026-09-20T08:41:10Z')
  const failed = ev(artifactA.candidateId, 'host_controller', {
    claim: 'mass_distilled_independent_evaluation_failed',
    artifactHash: hashA,
    error: 'mass_distilled_evaluation_holdout_revision_moved',
  }, '2026-09-20T08:29:20Z')
  const decision = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifactA],
    events: [canary(artifactA), approval, started, failed],
    now: new Date('2026-09-20T15:40:00Z'),
  })
  assert.equal(decision.issue, true)
  if (decision.issue) assert.equal(decision.evidence.priorFailedAttempts, 0)
})


test('rolling approval evidence is candidate-scoped and paginated so old exact canaries cannot fall out of a global row cap', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')
  assert.match(route, /const candidateIds = rows\.map\(row => row\.candidateId\)/)
  assert.match(route, /\.in\('candidate_id', candidateIds\)/)
  assert.match(route, /\.range\(from, to\)/)
  assert.match(route, /ROLLING_EVENT_PAGE_SIZE = 1000/)
  assert.match(route, /MASS_EVALUATION_ROLLING_AUTHORIZATION_REF/)
  assert.match(route, /authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF/)
  assert.match(route, /profile: 'cos_mass_distilled_independent_evaluation_runtime_v1'/)
  assert.doesNotMatch(route, /\.limit\(2000\)/)
})


test('a repair reopen marker preserves old verdict evidence but permits one new judge generation', () => {
  const oldVerdict = ev(artifactA.candidateId, 'independent_scorer', {
    claim: 'independent_evaluation',
    artifactHash: hashA,
  }, '2026-09-16T15:00:00Z')
  const oldCompleted = ev(artifactA.candidateId, 'host_controller', {
    claim: 'mass_distilled_independent_evaluation_completed',
    artifactHash: hashA,
  }, '2026-09-16T15:01:00Z')
  const reopened = ev(artifactA.candidateId, 'host_controller', {
    claim: MASS_EVALUATION_REOPEN_CLAIM,
    artifactHash: hashA,
    repairRef: MASS_EVALUATION_JUDGE_ABSOLUTE_REPAIR_REF,
  }, '2026-09-16T16:00:00Z')
  const decision = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifactA],
    events: [canary(artifactA), oldVerdict, oldCompleted, reopened],
    now,
  })
  assert.equal(decision.issue, true)
})

test('zero-collapse judge failures are evaluator infrastructure, not model-quality attempts', () => {
  const approval = ev(artifactA.candidateId, 'host_controller', {
    claim: 'distilled_independent_evaluation_approved',
    authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
    artifactHash: hashA,
  }, '2026-09-16T12:00:00Z', '2026-09-16T14:00:00Z')
  const started = ev(artifactA.candidateId, 'host_controller', {
    claim: 'mass_distilled_independent_evaluation_started',
    artifactHash: hashA,
  }, '2026-09-16T12:00:10Z', '2026-09-16T12:12:10Z')
  const failed = ev(artifactA.candidateId, 'host_controller', {
    claim: 'mass_distilled_independent_evaluation_failed',
    artifactHash: hashA,
    error: 'mass_distilled_evaluation_judge_zero_collapse:retention',
  }, '2026-09-16T12:00:20Z')
  const decision = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifactA],
    events: [canary(artifactA), approval, started, failed],
    now,
  })
  assert.equal(decision.issue, true)
  if (decision.issue) assert.equal(decision.evidence.priorFailedAttempts, 0)
})


test('mass evaluator evidence reads have a candidate-first fine_tune index', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../supabase/migrations/20260920050000_mass_evaluation_candidate_evidence_index.sql', import.meta.url), 'utf8')
  assert.match(migration, /candidate_id, verifier, observed_at desc/i)
  assert.match(migration, /where event_type = 'fine_tune'/i)
  assert.match(route, /\.in\('candidate_id', candidateIds\)/)
  assert.match(route, /\.gte\('observed_at', new Date\(Date\.now\(\) - 30 \* 86_400_000\)\.toISOString\(\)\)/)
})
