// saas/tests/universityBackwardsPass.node.test.ts
//
// Owner direction 2026-09-29: work the University pipeline backwards in one pass. Graduates leave the University
// for the Workforce; students quarantined only by OUR infrastructure failures get their exam back while real FAILs
// stay final; Residency stops losing cases to killed invocations and to requests larger than the student's window.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
  decideExhaustedMassEvaluationArtifacts,
  decideWronglyExhaustedMassEvaluationArtifacts,
  type RollingEvent,
} from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'
import { MASS_EVALUATION_EXHAUSTED_CLAIM, exhaustionDisposedArtifacts } from '../lib/ai/cos/cosUniversityMassQuarantineReview.ts'
import { RESIDENCY_EXACT_ARTIFACT_CONTEXT_TOKENS, residencyMaxOutputTokens } from '../platform-harness/residency/exact-artifact-model.ts'
import { RESIDENCY_STALE_STARTED_CASE_MS, staleStartedResidencyCases } from '../platform-harness/residency/stale-case-sweep.ts'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const now = new Date('2026-09-30T03:00:00.000Z')
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString()
const PROFILE = 'cos_mass_distilled_independent_evaluation_runtime_v1'

function student(id: string) {
  return { candidateId: `mass:${id}`, subjectId: 'History', artifactHash: id.repeat(64).slice(0, 64), createdAt: minutesAgo(3000) }
}
function history(id: string, errors: readonly string[], extra: RollingEvent[] = []): RollingEvent[] {
  const s = student(id)
  const approval: RollingEvent = { candidateId: s.candidateId, observedAt: minutesAgo(600), expiresAt: minutesAgo(480), verifier: 'host_controller',
    evidence: { artifactHash: s.artifactHash, authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF } }
  const failures: RollingEvent[] = errors.map((error, index) => ({ candidateId: s.candidateId, observedAt: minutesAgo(500 - index * 60), expiresAt: null,
    verifier: 'host_controller', evidence: { profile: PROFILE, claim: 'mass_distilled_independent_evaluation_failed', artifactHash: s.artifactHash, error } }))
  const disposal: RollingEvent = { candidateId: s.candidateId, observedAt: minutesAgo(200), expiresAt: null, verifier: 'host_controller',
    evidence: { profile: PROFILE, claim: MASS_EVALUATION_EXHAUSTED_CLAIM, artifactHash: s.artifactHash } }
  return [approval, ...failures, disposal, ...extra]
}

test('a student disposed for failures that are now proven to be OURS gets its exam back', () => {
  const quota = 'runpod patch /serverless/x http 500: control plane'
  const events = history('a', [quota, 'mass_distilled_evaluation_runtime_not_ready:network', 'cannot read properties of undefined (reading \'length\')'])
  const restored = decideWronglyExhaustedMassEvaluationArtifacts({ artifacts: [student('a')], events, now })
  assert.deepEqual(restored.map(item => item.candidateId), ['mass:a'])
  assert.equal(restored[0].substantiveFailures, 0)
  assert.equal(decideExhaustedMassEvaluationArtifacts({ artifacts: [student('a')], events, now }).length, 0,
    'the exhaustion sweep agrees: it would not dispose this student again')
})

test('a student with three real failures stays quarantined', () => {
  const events = history('b', ['mass_distilled_evaluation_holdout_regressed', 'mass_distilled_evaluation_safety_failed', 'mass_distilled_evaluation_transfer_failed'])
  assert.equal(decideWronglyExhaustedMassEvaluationArtifacts({ artifacts: [student('b')], events, now }).length, 0)
})

test('a student that SAT the exam keeps its result: a real FAIL is never reopened', () => {
  const s = student('c')
  const verdict: RollingEvent = { candidateId: s.candidateId, observedAt: minutesAgo(100), expiresAt: null, verifier: 'host_controller',
    evidence: { profile: PROFILE, claim: 'mass_distilled_independent_evaluation_completed', artifactHash: s.artifactHash, evaluationPassed: false } }
  const events = history('c', ['mass_distilled_evaluation_runtime_not_ready:network'], [verdict])
  assert.equal(decideWronglyExhaustedMassEvaluationArtifacts({ artifacts: [s], events, now }).length, 0)
})

test('only exhaustion disposals are reviewed; Residency FAILs and training stops are never touched', () => {
  const disposed = history('d', [])
  const residencyFailed = student('e')
  const picked = exhaustionDisposedArtifacts([student('d'), residencyFailed], disposed)
  assert.deepEqual(picked.map(row => row.candidateId), ['mass:d'])
})

test('the review restores to PENDING only while still quarantined and records why, without spending', () => {
  const review = read('lib/ai/cos/cosUniversityMassQuarantineReview.ts')
  assert.match(review, /\.update\(\{ status: 'evaluation_pending', updated_at: now\.toISOString\(\) \}\)[\s\S]{0,200}\.eq\('status', 'quarantined'\)/)
  assert.match(review, /reason: 'exhaustion_attempts_now_classified_as_infrastructure'/)
  assert.doesNotMatch(review, /activateMassDistilled|callLocalModel|runpod/i)
  const route = read('app/api/cron/cos-university-mass-backlog-compact/route.ts')
  assert.ok(route.indexOf('await reviewQuarantine()') < route.indexOf('await compactMassEvaluationBacklog('))
  assert.match(route, /return \{error:message\}/, 'a review failure never stops compaction')
})

test('Residency requests never ask for more output than fits in the 8,192-token window', () => {
  assert.equal(RESIDENCY_EXACT_ARTIFACT_CONTEXT_TOKENS, 8192)
  assert.equal(residencyMaxOutputTokens('short', 'short', 4096), 4096)
  const grown = 'x'.repeat(15_000)
  const fitted = residencyMaxOutputTokens(grown, '', 4096)
  assert.ok(fitted < 4096 && Math.ceil(15_000 / 3) + 32 + fitted + 256 <= 8192)
  assert.equal(residencyMaxOutputTokens('x'.repeat(40_000), '', 4096), 256, 'never below the floor: at worst sent as before')
  assert.equal(residencyMaxOutputTokens('a', 'b', 9000), 4096, 'never raises the request')
  assert.match(read('platform-harness/residency/exact-artifact-model.ts'), /max_tokens:residencyMaxOutputTokens\(request\.system,request\.user,request\.maxTokens\)/)
})

test('a case abandoned by a killed invocation is closed without evidence; live cases are untouched', () => {
  const rows = [
    { id: 'old', status: 'started', started_at: new Date(now.getTime() - RESIDENCY_STALE_STARTED_CASE_MS - 60_000).toISOString() },
    { id: 'live', status: 'started', started_at: minutesAgo(5) },
    { id: 'done', status: 'passed', started_at: minutesAgo(60) },
  ]
  assert.deepEqual(staleStartedResidencyCases(rows, now).map(row => row.id), ['old'])
  const sweep = read('platform-harness/residency/stale-case-sweep.ts')
  assert.match(sweep, /status: 'rejected',\s+harness_outcome: 'harness_failure'/)
  assert.doesNotMatch(sweep, /competency_evidence/, 'never writes a pass or a fail for the student')
})

test('Residency starts a case only when it fits in what is left of the invocation', () => {
  const route = read('app/api/cron/cos-university-residency/route.ts')
  assert.match(route, /const readyBudgetMs = RESIDENCY_INVOCATION_BUDGET_MS - \(Date\.now\(\) - tickStartedAt\) - RESIDENCY_CASE_EXECUTION_RESERVE_MS/)
  assert.match(route, /if \(readyBudgetMs < RESIDENCY_MIN_READY_MS\) \{\s+stoppedForTimeBudget = true\s+break/)
  assert.match(route, /createLiveBuilderResidencyExecutor\(\{ db, readyTimeoutMs: Math\.min\(360_000, readyBudgetMs\) \}\)/)
  assert.ok(route.indexOf('closeStaleStartedResidencyCases(') < route.indexOf('runBuilderResidencyOrchestrator({'))
  assert.match(read('platform-harness/residency/live-builder-executor.ts'), /timeoutMs:BUILDER_RESIDENCY_PROVIDER_TIMEOUT_MS,\s+readyTimeoutMs,/)
})

test('the University dashboard no longer lists graduates; the Workforce does, in all five languages', () => {
  const page = read('app/dashboard/cos-university-telemetry/page.tsx')
  assert.doesNotMatch(page, /label="Active graduates"/)
  assert.match(page, /copy\.workforceTitle/)
  assert.match(page, /copy\.pipelineResidencyFailed/)
  const api = read('app/api/admin/cos-university-telemetry/route.ts')
  assert.match(api, /const WORKFORCE = 'cos_workforce_roster'/)
  assert.match(api, /available: !workforceResult\.error/)
  const copy = read('lib/i18n/cosUniversityTelemetryCopy.ts')
  for (const key of ['workforceTitle', 'workforceOnCall', 'workforceNone', 'pipelineResidencyFailed']) {
    assert.equal(copy.match(new RegExp(`\\n    ${key}: `, 'g'))?.length, 5, `${key} in en, es, pt, pl, ru`)
  }
})
