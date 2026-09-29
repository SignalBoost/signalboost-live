//
// Owner direction 2026-09-28 (test phase): the wait before a mass student's exam is 10 minutes, not 12 hours.
// One TypeScript value drives approval, the evaluator's guard and canary ordering; the SQL claim must match it.
// Only the wait changed - the retention questions and pass rule are untouched.
// Gated in scripts/vercel-cos-gates.mjs since 2026-09-29: #3480 silently put the evaluator back to 12 hours.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { MASS_RETENTION_DELAY_MS, MASS_RETENTION_DELAY_SQL_INTERVAL } from '../lib/ai/cos/cosUniversityMassRetentionDelay.ts'
import { MASS_EVALUATION_RETENTION_DELAY_MS, MASS_EVALUATION_ROLLING_AUTHORIZATION_REF, decideExhaustedMassEvaluationArtifacts, decideRollingMassEvaluationApproval } from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'
import { MASS_CANARY_EVALUATION_ELIGIBILITY_DELAY_MS } from '../lib/ai/cos/cosUniversityMassCanaryRollingAuthority.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('the test-phase wait is 10 minutes and every TypeScript gate uses the same value', () => {
  assert.equal(MASS_RETENTION_DELAY_MS, 10 * 60 * 1000)
  assert.equal(MASS_EVALUATION_RETENTION_DELAY_MS, MASS_RETENTION_DELAY_MS)
  assert.equal(MASS_CANARY_EVALUATION_ELIGIBILITY_DELAY_MS, MASS_RETENTION_DELAY_MS)
  const evaluator = read('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts')
  assert.match(evaluator, /export const MASS_DISTILLED_RETENTION_DELAY_MS = MASS_RETENTION_DELAY_MS/)
  assert.doesNotMatch(evaluator, /MASS_DISTILLED_RETENTION_DELAY_MS = 12 \* 60 \* 60 \* 1000/)
})

test('the SQL claim is switched to the same interval, in place', () => {
  const migration = read('../supabase/migrations/20260929021500_mass_evaluation_test_phase_retention_delay.sql')
  assert.equal(MASS_RETENTION_DELAY_SQL_INTERVAL, '10 minutes')
  assert.match(migration, /p\.proname = 'claim_next_mass_distilled_evaluation'/)
  assert.match(migration, /replace\(definition, 'interval ''12 hours''', 'interval ''10 minutes'''\)/)
  assert.match(migration, /pg_get_functiondef/)
})

test('a student older than 10 minutes is no longer held back by age; a brand-new one still is', () => {
  const now = new Date('2026-09-29T03:00:00.000Z')
  const artifact = (candidateId: string, minutesOld: number) => ({
    candidateId,
    subjectId: 'History',
    artifactHash: 'a'.repeat(64),
    revisionKey: 'b'.repeat(64),
    createdAt: new Date(now.getTime() - minutesOld * 60_000).toISOString(),
  }) as any
  const decision: any = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifact('mass:fresh', 5), artifact('mass:ready', 11)],
    events: [],
    now,
  })
  assert.equal(decision.skipped?.younger_than_retention_delay, 1)
  // The 11-minute student passes the age check and stops only on the next real gate (no canary yet).
  assert.equal(decision.skipped?.no_exact_healthy_canary, 1)
})

test('an evaluator age refusal is our own gate disagreement and never fails a student out', () => {
  const hash = 'a'.repeat(64)
  const student = { candidateId: 'mass:age-refused', subjectId: 'History', artifactHash: hash, revisionKey: 'b'.repeat(64), createdAt: '2026-09-29T02:00:00.000Z' } as any
  const event = (claim: string, observedAt: string, evidence: Record<string, unknown> = {}) => ({
    candidateId: student.candidateId,
    observedAt,
    expiresAt: null,
    verifier: 'host_controller',
    evidence: { profile: 'cos_mass_distilled_independent_evaluation_runtime_v1', claim, artifactHash: hash, ...evidence },
  }) as any
  const approval = event('distilled_independent_evaluation_approved', '2026-09-29T02:20:00.000Z', { profile: 'cos_distilled_independent_evaluation_authorization_v1', authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF })
  const refusals = [1, 2, 3].map(n => event('mass_distilled_independent_evaluation_failed', `2026-09-29T02:${20 + n * 5}:00.000Z`, { error: 'mass_distilled_evaluation_retention_delay_not_met' }))
  assert.equal(decideExhaustedMassEvaluationArtifacts({ artifacts: [student], events: [approval, ...refusals], now: new Date('2026-09-29T03:00:00.000Z') }).length, 0)
  const canary = read('../lib/ai/cos/cosUniversityMassCanaryRollingAuthority.ts')
  assert.match(canary, /error === 'mass_distilled_evaluation_retention_delay_not_met'/)
})
