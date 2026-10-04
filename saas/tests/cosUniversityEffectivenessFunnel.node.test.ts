// saas/tests/cosUniversityEffectivenessFunnel.node.test.ts
//
// The Artifact Effectiveness Funnel: one cohort counted through every stage from the tables, with the honesty rows.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  EVALUATION_FAILED_CLAIM,
  FUNNEL_COHORT_LIMIT,
  FUNNEL_READ_CHUNK,
  FUNNEL_SCHEMA_VERSION,
  composeFunnel,
  describeFunnel,
  readEffectivenessFunnel,
} from '../lib/ai/cos/cosUniversityEffectivenessFunnel.ts'
import { isEvaluatorInfrastructureFailure } from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'
import { COS_UNIVERSITY_FUNNEL_COPY } from '../lib/i18n/cosUniversityFunnelCopy.ts'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')
const H = (c: string) => c.repeat(64)
const NOW = new Date('2026-10-04T20:00:00Z')

/** PostgREST-shaped store over in-memory tables; records every query so chunking can be proven. */
function fakeDb(tables: Record<string, any[]>, failing: Set<string> = new Set()) {
  const queries: Array<{ table: string; columns: string; inSize: number | null }> = []
  const db = {
    from(table: string) {
      const filters: Array<(row: any) => boolean> = []
      let columns = '*'
      let inSize: number | null = null
      let order: { column: string; ascending: boolean } | null = null
      let limit = Infinity
      const run = () => {
        queries.push({ table, columns, inSize })
        if (failing.has(table)) return { data: null, error: new Error(`${table}_unreadable`) }
        let rows = (tables[table] || []).filter(row => filters.every(f => f(row)))
        if (order) rows = [...rows].sort((a, b) => String(a[order!.column] ?? '').localeCompare(String(b[order!.column] ?? '')) * (order!.ascending ? 1 : -1))
        return { data: rows.slice(0, limit), error: null }
      }
      const q: any = {
        select(c: string) { columns = c; return q },
        eq(column: string, value: unknown) { filters.push(row => String(row[column]) === String(value)); return q },
        neq(column: string, value: unknown) { filters.push(row => String(row[column]) !== String(value)); return q },
        gte(column: string, value: string) { filters.push(row => String(row[column] ?? '') >= value); return q },
        in(column: string, values: readonly unknown[]) { inSize = values.length; const set = new Set(values.map(String)); filters.push(row => set.has(String(row[column]))); return q },
        order(column: string, options: { ascending: boolean }) { order = { column, ascending: options.ascending }; return q },
        limit(n: number) { limit = n; return q },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) { return Promise.resolve(run()).then(resolve, reject) },
      }
      return q
    },
  }
  return { db, queries }
}

/** Four artifacts born this week: one full life, one failed exam, one quarantined, one old (outside 24h). */
const week = () => ({
  cos_local_distillation_artifacts: [
    { candidate_id: 'a', trained_artifact_hash: H('a'), status: 'active', subject_id: 'cs', created_at: '2026-10-04T10:00:00Z' },
    { candidate_id: 'b', trained_artifact_hash: H('b'), status: 'evaluation_pending', subject_id: 'law', created_at: '2026-10-04T11:00:00Z' },
    { candidate_id: 'c', trained_artifact_hash: H('c'), status: 'quarantined', subject_id: 'law', created_at: '2026-10-03T11:00:00Z' },
    { candidate_id: 'd', trained_artifact_hash: H('d'), status: 'retired', subject_id: 'cs', created_at: '2026-09-30T11:00:00Z' },
  ],
  cos_university_artifact_birth_certificates: [{ candidate_id: 'a' }, { candidate_id: 'b' }, { candidate_id: 'c' }],
  cos_university_mass_distillation_batch_runs: [
    { stage: 'complete', subject_id: 'cs', created_at: '2026-10-04T09:00:00Z' },
    { stage: 'complete', subject_id: 'law', created_at: '2026-10-04T09:30:00Z' },
    { stage: 'failed', subject_id: 'law', created_at: '2026-10-04T09:40:00Z' },
    { stage: 'training_dispatched', subject_id: 'cs', created_at: '2026-10-04T19:00:00Z' },
    { stage: 'complete', subject_id: 'cs', created_at: '2026-09-20T09:00:00Z' },
  ],
  cos_university_distilled_evaluation_runs: [
    // a: failed first, passed later -> the LATEST run decides.
    { candidate_id: 'a', trained_artifact_hash: H('a'), created_at: '2026-10-04T12:00:00Z', baseline_score: 0.4, trained_artifact_score: 0.3, holdout_improved: false, safety_passed: true, unseen_transfer_passed: true, delayed_retention_passed: true },
    { candidate_id: 'a', trained_artifact_hash: H('a'), created_at: '2026-10-04T13:00:00Z', baseline_score: 0.4, trained_artifact_score: 0.7, holdout_improved: true, safety_passed: true, unseen_transfer_passed: true, delayed_retention_passed: true },
    { candidate_id: 'c', trained_artifact_hash: H('c'), created_at: '2026-10-03T12:00:00Z', baseline_score: 0.5, trained_artifact_score: 0.6, holdout_improved: true, safety_passed: false, unseen_transfer_passed: true, delayed_retention_passed: true },
    // a different hash of candidate b: not this cohort's artifact.
    { candidate_id: 'b', trained_artifact_hash: H('9'), created_at: '2026-10-04T12:00:00Z', baseline_score: 0.2, trained_artifact_score: 0.9, holdout_improved: true, safety_passed: true, unseen_transfer_passed: true, delayed_retention_passed: true },
  ],
  cos_university_residency_enrollments: [{ candidate_id: 'a', trained_artifact_hash: H('a'), standing: 'residency_complete' }],
  cos_university_graduate_model_registry: [{ candidate_id: 'a', trained_artifact_hash: H('a'), promoted_at: '2026-10-04T14:00:00Z', activated_at: '2026-10-04T14:30:00Z' }],
  cos_workforce_roster: [{ candidate_id: 'a', trained_artifact_hash: H('a') }],
  cos_university_graduate_serving_attempts: [
    { candidate_id: 'a', trained_artifact_hash: H('a'), phase: 'attempt_started', outcome: 'pending' },
    { candidate_id: 'a', trained_artifact_hash: H('a'), phase: 'attempt_failed', outcome: 'timeout' },
    { candidate_id: 'a', trained_artifact_hash: H('a'), phase: 'attempt_succeeded', outcome: 'success' },
  ],
  cos_university_graduate_lifecycle_events: [{ candidate_id: 'a', trained_artifact_hash: H('a'), event_type: 'verified_outcome' }],
  cos_university_learning_assurance_events: [
    { event_type: 'fine_tune', observed_at: '2026-10-04T12:05:00Z', evidence: { claim: EVALUATION_FAILED_CLAIM, error: 'mass_distilled_evaluation_judge_zero_collapse:safety' } },
    { event_type: 'fine_tune', observed_at: '2026-10-04T12:06:00Z', evidence: { claim: EVALUATION_FAILED_CLAIM, error: 'mass_distilled_evaluation_candidate_answer_empty:0666f0:finish=stop' } },
    { event_type: 'fine_tune', observed_at: '2026-10-04T13:05:00Z', evidence: { claim: 'mass_distilled_independent_evaluation_completed' } },
    { event_type: 'fine_tune', observed_at: '2026-09-20T13:05:00Z', evidence: { claim: EVALUATION_FAILED_CLAIM, error: 'mass_distilled_evaluation_judge_timeout:holdout' } },
    { event_type: 'production_path', observed_at: '2026-10-04T12:05:00Z', evidence: { error: 'mass_distilled_evaluation_judge_zero_collapse:safety' } },
  ],
})

const stageCount = (f: Awaited<ReturnType<typeof readEffectivenessFunnel>>, id: string) => f.stages.find(s => s.id === id)?.count

test('the 7-day cohort is followed through every stage; the latest exam decides; a different hash is not this artifact', async () => {
  const f = await readEffectivenessFunnel({ db: fakeDb(week()).db, window: '7d', now: NOW })
  assert.equal(f.schemaVersion, FUNNEL_SCHEMA_VERSION)
  assert.equal(f.since, '2026-09-27T20:00:00.000Z')
  assert.equal(f.cohort.size, 4)
  assert.equal(f.cohort.truncated, false)
  const expect: Record<string, number> = {
    born: 4, birth_certificate: 3, examined: 2, improved_over_baseline: 2, passed_safety: 1, passed_transfer: 2, passed_retention: 2,
    passed_all_gates: 1, residency_enrolled: 1, residency_complete: 1, graduated: 1, activated: 1, hired: 1,
    performed_work: 1, served_successfully: 1, verified_outcome: 1,
  }
  for (const [id, n] of Object.entries(expect)) assert.equal(stageCount(f, id), n, id)
  assert.equal(f.stages.find(s => s.id === 'graduated')?.share, 0.25)
  assert.ok(f.stages.every(s => s.source.startsWith('cos_')), 'every stage names its table')
  assert.deepEqual(f.rejected, { quarantined: 1, retired: 1, byStatus: { active: 1, evaluation_pending: 1, quarantined: 1, retired: 1 }, source: 'cos_local_distillation_artifacts' })
  assert.ok(f.production.available && f.production.runsStarted === 4 && f.production.runsCompleted === 2 && f.production.runsFailed === 1 && f.production.runsInFlight === 1)
  assert.ok(f.capabilityGain.available)
  if (f.capabilityGain.available) {
    assert.equal(f.capabilityGain.sampleSize, 2)
    assert.equal(f.capabilityGain.improved, 2)
    assert.equal(f.capabilityGain.regressed, 0)
    assert.equal(f.capabilityGain.meanBaseline, 0.45)
    assert.ok(Math.abs((f.capabilityGain.meanTrained ?? 0) - 0.65) < 1e-12)
    assert.ok(Math.abs((f.capabilityGain.meanAbsoluteGain ?? 0) - 0.2) < 1e-12)
    assert.ok(Math.abs((f.capabilityGain.medianAbsoluteGain ?? 0) - 0.2) < 1e-12)
    assert.equal(f.capabilityGain.positiveGainRate, 1)
  }
  assert.deepEqual(f.unavailable, {})
  assert.equal(describeFunnel(f), 'funnel window=7d born=4 examined=2 (50%) passed_all=1 (25%) graduated=1 (25%) hired=1 worked=1 verified=1 (25%) | gain n=2 mean=0.2000 positive=100% | rejected quarantined=1 retired=1 | eval failures=2 infra=1 merit=1')
})

test('evaluation failures in the window are split by the rolling authority\'s own rule, and only terminal FAILED claims count', async () => {
  const f = await readEffectivenessFunnel({ db: fakeDb(week()).db, window: '7d', now: NOW })
  assert.ok(f.evaluationFailures.available)
  if (!f.evaluationFailures.available) return
  assert.equal(f.evaluationFailures.total, 2, 'completed claims and production_path copies are not failures')
  assert.equal(f.evaluationFailures.infrastructure, 1)
  assert.equal(f.evaluationFailures.merit, 1)
  assert.deepEqual(f.evaluationFailures.byReason, { 'mass_distilled_evaluation_judge_zero_collapse:safety': 1, 'mass_distilled_evaluation_candidate_answer_empty:0666f0': 1 })
  assert.equal(f.evaluationFailures.rule, 'cosUniversityMassEvaluationRollingAuthority.isEvaluatorInfrastructureFailure')
  assert.equal(isEvaluatorInfrastructureFailure('mass_distilled_evaluation_judge_zero_collapse:safety'), true)
  assert.equal(isEvaluatorInfrastructureFailure('mass_distilled_evaluation_candidate_answer_empty:x'), false)
})

test('window and subject narrow the cohort and the production counts', async () => {
  const day = await readEffectivenessFunnel({ db: fakeDb(week()).db, window: '24h', now: NOW })
  assert.equal(day.cohort.size, 2)
  assert.ok(day.production.available && day.production.runsStarted === 4)
  const cs = await readEffectivenessFunnel({ db: fakeDb(week()).db, window: 'all', subjectId: 'cs', now: NOW })
  assert.equal(cs.since, null)
  assert.equal(cs.cohort.size, 2)
  assert.equal(cs.subjectId, 'cs')
  assert.ok(cs.production.available && cs.production.runsStarted === 3)
  assert.equal(stageCount(cs, 'graduated'), 1)
  const unknownWindow = await readEffectivenessFunnel({ db: fakeDb(week()).db, window: 'yesterday', now: NOW })
  assert.equal(unknownWindow.window, '7d', 'an unknown window falls back to 7d, never to all time')
})

test('an unreadable table zeroes its stages AND is named; a reader can never take that zero for a fact', async () => {
  const f = await readEffectivenessFunnel({ db: fakeDb(week(), new Set(['cos_university_graduate_model_registry'])).db, window: '7d', now: NOW })
  assert.equal(stageCount(f, 'graduated'), 0)
  assert.equal(stageCount(f, 'activated'), 0)
  assert.equal(stageCount(f, 'hired'), 1, 'other chapters still read')
  assert.deepEqual(f.unavailable, { graduation: 'cos_university_graduate_model_registry_unreadable' })
  assert.match(describeFunnel(f), /\| unavailable=graduation$/)
})

test('an empty cohort has no shares and no division by zero', () => {
  const empty = <T,>(v: T) => Object.freeze({ available: true as const, error: null, ...v })
  const f = composeFunnel({
    now: NOW, window: '24h', since: '2026-10-03T20:00:00.000Z', subjectId: null, cohort: [], truncated: false,
    production: empty({ runsStarted: 0, runsCompleted: 0, runsFailed: 0 }),
    certified: empty({ candidates: new Set<string>() }),
    examined: empty({ latestByKey: new Map() }),
    residency: empty({ enrolled: new Set<string>(), complete: new Set<string>() }),
    graduation: empty({ promoted: new Set<string>(), activated: new Set<string>() }),
    hired: empty({ candidates: new Set<string>() }),
    work: empty({ attempted: new Set<string>(), succeeded: new Set<string>() }),
    verified: empty({ candidates: new Set<string>() }),
    evaluationFailures: empty({ errors: [] }),
  })
  assert.ok(f.stages.every(s => s.count === 0 && s.share === null))
  assert.match(describeFunnel(f), /born=0 examined=0 \(n\/a\)/)
})

test('a large cohort is read in chunks of candidate ids, capped and reported as truncated', async () => {
  const tables = week()
  tables.cos_local_distillation_artifacts = Array.from({ length: FUNNEL_COHORT_LIMIT + 5 }, (_, i) => ({
    candidate_id: `m${i}`, trained_artifact_hash: H('e'), status: 'evaluation_ready', subject_id: 'cs', created_at: `2026-10-04T0${i % 10}:00:00Z`,
  }))
  const { db, queries } = fakeDb(tables)
  const f = await readEffectivenessFunnel({ db, window: '7d', now: NOW })
  assert.equal(f.cohort.size, FUNNEL_COHORT_LIMIT)
  assert.equal(f.cohort.truncated, true)
  const chunked = queries.filter(q => q.inSize !== null)
  assert.ok(chunked.length > 0 && chunked.every(q => (q.inSize as number) <= FUNNEL_READ_CHUNK), 'no in() read exceeds the chunk size')
  assert.equal(FUNNEL_READ_CHUNK, 100)
  assert.match(describeFunnel(f), /born=1500\+ /)
})

test('the API is owner-gated read-only, the panel is mounted after the settings and before the life record', () => {
  const api = read('../app/api/admin/cos-university-effectiveness/route.ts')
  assert.match(api, /export async function GET\(req: NextRequest\)[\s\S]{0,80}?await requireOwner\(\)/)
  assert.doesNotMatch(api, /export async function (POST|PATCH|PUT|DELETE)/)
  assert.match(api, /window: req\.nextUrl\.searchParams\.get\('window'\),\s*subjectId: req\.nextUrl\.searchParams\.get\('subject'\)/)
  const page = read('../app/dashboard/cos-university-telemetry/page.tsx')
  assert.match(page, /<UniversitySettingsPanel copy=\{settingsCopy\} \/>\s*<EffectivenessFunnelPanel copy=\{funnelCopy\} subjects=\{funnelSubjects\} \/>\s*<ArtifactLifeRecordPanel copy=\{lifeRecordCopy\} \/>/)
  const panel = read('../app/dashboard/cos-university-telemetry/EffectivenessFunnelPanel.tsx')
  assert.match(panel, /const FUNNEL_URL = '\/api\/admin\/cos-university-effectiveness'/)
  assert.doesNotMatch(panel, /method: '(POST|PATCH|PUT|DELETE)'/)
  assert.doesNotMatch(panel, />[A-Z][a-z]+ [a-z]+</, 'every visible string comes from copy')
  // Every stage id the module emits has a label in the copy.
  const source = read('../lib/ai/cos/cosUniversityEffectivenessFunnel.ts')
  const ids = Array.from(source.matchAll(/stage\('([a-z_]+)',/g)).map(m => m[1])
  assert.equal(ids.length, 16)
  for (const id of ids) assert.match(panel, new RegExp(`^\\s+${id}: 'stage[A-Za-z]+',$`, 'm'), `${id} has a label`)
})

test('the funnel copy has the same keys in all five languages and no empty string', () => {
  const languages = Object.keys(COS_UNIVERSITY_FUNNEL_COPY).sort()
  assert.deepEqual(languages, ['en', 'es', 'pl', 'pt', 'ru'])
  const keys = Object.keys(COS_UNIVERSITY_FUNNEL_COPY.en)
  for (const language of languages) {
    const block = COS_UNIVERSITY_FUNNEL_COPY[language as keyof typeof COS_UNIVERSITY_FUNNEL_COPY]
    assert.deepEqual(Object.keys(block), keys, language)
    for (const key of keys) assert.ok(String((block as any)[key]).trim().length > 0, `${language}.${key}`)
  }
})
// end of saas/tests/cosUniversityEffectivenessFunnel.node.test.ts (if this line is missing, the paste was cut short)
