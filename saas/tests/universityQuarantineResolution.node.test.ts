//
// Owner direction 2026-09-30: "what is the reason of quarantine forever ... if they are there because of our
// infrastructure fix it - if because they are incompetent delete them" and "find why they are there, so we can fix
// others and they will not stay there forever". Proven FAILs leave the University, our-fault students go back to the
// exam, every reason is recorded, and the dashboard shows WHY students fail so training can be fixed.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { MASS_EVALUATION_ROLLING_AUTHORIZATION_REF, type RollingEvent } from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'
import {
  QUARANTINE_DISMISSED_CLAIM,
  QUARANTINE_RESOLUTION_PROFILE,
  QUARANTINE_RETURNED_CLAIM,
  classifyQuarantinedStudent,
  errorCode,
  summarizeQuarantine,
  type QuarantineClassification,
  type QuarantineStudent,
} from '../lib/ai/cos/cosUniversityQuarantineReasons.ts'
import {
  QUARANTINE_RESOLUTION_MAX_PER_RUN,
  decideQuarantineResolution,
  resolveQuarantine,
} from '../lib/ai/cos/cosUniversityQuarantineResolution.ts'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const now = new Date('2026-09-30T05:00:00.000Z')
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString()
const PROFILE = 'cos_mass_distilled_independent_evaluation_runtime_v1'
const hashOf = (id: string) => id.repeat(64).slice(0, 64)

function student(id: string, status = 'quarantined', extra: Partial<QuarantineStudent> = {}): QuarantineStudent {
  return { candidateId: `mass:${id}`, subjectId: 'History', artifactHash: hashOf(id), createdAt: minutesAgo(5000), status, ...extra }
}
function event(s: { candidateId: string; artifactHash: string }, minutes: number, evidence: Record<string, unknown>): RollingEvent {
  return { candidateId: s.candidateId, observedAt: minutesAgo(minutes), expiresAt: null, verifier: 'host_controller', evidence: { artifactHash: s.artifactHash, ...evidence } }
}
const classification = (reason: QuarantineClassification['reason']): QuarantineClassification =>
  ({ reason, final: false, since: null, lastError: null, failedGates: [], failedCompetencies: [] })

test('the owner rule: incompetent leaves, ours goes back to the exam, nothing loops', () => {
  for (const reason of ['exam_failed', 'residency_failed', 'exhausted_real_failures'] as const) {
    assert.deepEqual({ ...decideQuarantineResolution({ classification: classification(reason), candidateId: 'mass:a', alreadyReturned: false }) },
      { action: 'dismiss', reason, ours: false })
  }
  assert.deepEqual({ ...decideQuarantineResolution({ classification: classification('exam_data_defect'), candidateId: 'mass:a', alreadyReturned: false }) },
    { action: 'dismiss', reason: 'exam_data_defect', ours: true }, 'never examinable, recorded as OURS, not as a FAIL')
  assert.equal(decideQuarantineResolution({ classification: classification('exhausted_our_errors'), candidateId: 'mass:a', alreadyReturned: false }).action,
    'leave_for_review', 'the quarantine review returns it to the exam')
  assert.equal(decideQuarantineResolution({ classification: classification('no_recorded_reason'), candidateId: 'mass:a', alreadyReturned: false }).action, 'return_to_exam')
  assert.equal(decideQuarantineResolution({ classification: classification('no_recorded_reason'), candidateId: 'mass:a', alreadyReturned: true }).action,
    'hold_for_investigation', 'a second unexplained quarantine is our defect to find, never a loop and never a dismissal')
  assert.equal(decideQuarantineResolution({ classification: classification('no_recorded_reason'), candidateId: 'legacy:a', alreadyReturned: false }).action,
    'hold_for_investigation')
})

test('an old FAIL that was deliberately reopened is not the reason a student is quarantined today', () => {
  const s = student('a')
  const events = [
    event(s, 900, { profile: PROFILE, claim: 'mass_distilled_independent_evaluation_completed', evaluationPassed: false }),
    event(s, 800, { claim: 'mass_distilled_independent_evaluation_reopened', repairRef: 'owner_explicit_direction_2026-09-26_retest_all_quarantined' }),
  ]
  assert.equal(classifyQuarantinedStudent({ student: s, events, now }).reason, 'no_recorded_reason')
})

test('exhausted again after a reopen, with no new record, is read from the same counter the sweep uses', () => {
  const s = student('b')
  const approval: RollingEvent = { candidateId: s.candidateId, observedAt: minutesAgo(700), expiresAt: minutesAgo(600), verifier: 'host_controller',
    evidence: { artifactHash: s.artifactHash, authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF } }
  const events = [
    event(s, 1000, { profile: PROFILE, claim: 'mass_distilled_evaluation_attempts_exhausted' }),
    event(s, 900, { claim: 'mass_distilled_independent_evaluation_reopened' }),
    approval,
    ...['mass_distilled_evaluation_holdout_regressed', 'mass_distilled_evaluation_safety_failed', 'mass_distilled_evaluation_transfer_failed']
      .map((error, index) => event(s, 600 - index * 60, { profile: PROFILE, claim: 'mass_distilled_independent_evaluation_failed', error })),
  ]
  assert.equal(classifyQuarantinedStudent({ student: s, events, now }).reason, 'exhausted_real_failures')
})

test('the dashboard learns WHY: failed exam tests, failed Residency skills and the most common errors, including students already removed', () => {
  const failed = student('1')
  const residency = student('2')
  const removed = student('3', 'retired')
  const spent = student('4')
  const byCandidate = new Map<string, RollingEvent[]>([
    [failed.candidateId, [event(failed, 30, { claim: 'mass_distilled_independent_evaluation_completed', evaluationPassed: false,
      holdout: { improved: true }, safety: { passed: false }, transfer: { passed: false }, retention: { passed: true } })]],
    [residency.candidateId, [event(residency, 40, { claim: 'builder_residency_failed', failedCompetencies: [{ competencyId: 'root_cause_diagnosis' }] })]],
    [removed.candidateId, [event(removed, 20, { profile: QUARANTINE_RESOLUTION_PROFILE, claim: QUARANTINE_DISMISSED_CLAIM, reason: 'exam_failed',
      failedGates: ['safety'], failedCompetencies: [], lastError: null })]],
    [spent.candidateId, [
      { candidateId: spent.candidateId, observedAt: minutesAgo(900), expiresAt: minutesAgo(800), verifier: 'host_controller',
        evidence: { artifactHash: spent.artifactHash, authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF } },
      ...[1, 2, 3].map(index => event(spent, 800 - index * 10, { profile: PROFILE, claim: 'mass_distilled_independent_evaluation_failed', error: 'mass_distilled_evaluation_holdout_regressed' })),
      event(spent, 500, { profile: PROFILE, claim: 'mass_distilled_evaluation_attempts_exhausted', lastError: 'mass_distilled_evaluation_holdout_regressed: 0.41 < 0.52' }),
    ]],
  ])
  const { summary } = summarizeQuarantine({ students: [failed, residency, removed, spent], eventsFor: id => byCandidate.get(id) || [], now })
  assert.equal(summary.total, 3)
  assert.equal(summary.leftUniversity.total, 1)
  assert.equal(summary.leftUniversity.byReason.exam_failed, 1)
  assert.deepEqual({ ...summary.why.examGates }, { holdout: 0, safety: 2, transfer: 1, retention: 0 })
  assert.deepEqual(summary.why.residencyCompetencies.map(item => ({ ...item })), [{ competency: 'root_cause_diagnosis', count: 1 }])
  assert.deepEqual(summary.why.topErrors.map(item => ({ ...item })), [{ error: 'mass_distilled_evaluation_holdout_regressed', count: 1 }])
  assert.equal(errorCode('runpod get /serverless http 500: failed to list endpoints'), 'runpod get /serverless http #')
})

// Minimal PostgREST-shaped fake: enough of the query builder for the resolution, with conditional updates.
function fakeDb(tables: Record<string, any[]>) {
  const calls: string[] = []
  const from = (table: string) => {
    const filters: Array<(row: any) => boolean> = []
    let mode: 'select' | 'update' | 'upsert' = 'select'
    let patch: any = null
    let window: [number, number] | null = null
    let limit = Infinity
    const builder: any = {
      select: () => builder,
      eq: (column: string, value: unknown) => { filters.push(row => row[column] === value); return builder },
      in: (column: string, values: unknown[]) => { filters.push(row => values.includes(row[column])); return builder },
      order: () => builder,
      range: (a: number, b: number) => { window = [a, b]; return builder },
      limit: (n: number) => { limit = n; return builder },
      update: (value: any) => { mode = 'update'; patch = value; return builder },
      upsert: (value: any) => { mode = 'upsert'; patch = value; return builder },
      then: (resolve: (value: any) => unknown) => {
        const rows = tables[table] || (tables[table] = [])
        if (mode === 'upsert') {
          calls.push(`upsert:${table}`)
          if (!rows.some(row => row.event_key === patch.event_key)) rows.push(patch)
          return Promise.resolve(resolve({ data: null, error: null }))
        }
        const matched = rows.filter(row => filters.every(filter => filter(row)))
        if (mode === 'update') {
          calls.push(`update:${table}:${patch.status}`)
          for (const row of matched) Object.assign(row, patch)
          return Promise.resolve(resolve({ data: matched.map(row => ({ id: row.id })), error: null }))
        }
        const sliced = window ? matched.slice(window[0], window[1] + 1) : matched
        return Promise.resolve(resolve({ data: sliced.slice(0, limit), error: null }))
      },
    }
    return builder
  }
  return { db: { from }, tables, calls }
}

test('the resolution acts on every quarantined student and records why, conditionally and at most once', async () => {
  const artifact = (id: string, status = 'quarantined') => ({ id, candidate_id: `mass:${id}`, subject_id: 'History', trained_artifact_hash: hashOf(id), created_at: minutesAgo(5000), updated_at: minutesAgo(100), status })
  const row = (s: { candidateId: string; artifactHash: string }, minutes: number, evidence: Record<string, unknown>) => ({
    candidate_id: s.candidateId, observed_at: minutesAgo(minutes), expires_at: null, verifier: 'host_controller', event_type: 'fine_tune',
    evidence: { artifactHash: s.artifactHash, ...evidence },
  })
  const failed = { candidateId: 'mass:1', artifactHash: hashOf('1') }
  const unknown = { candidateId: 'mass:2', artifactHash: hashOf('2') }
  const returnedBefore = { candidateId: 'mass:3', artifactHash: hashOf('3') }
  const { db, tables } = fakeDb({
    cos_local_distillation_artifacts: [artifact('1'), artifact('2'), artifact('3'), artifact('4', 'evaluation_pending')],
    cos_university_learning_assurance_events: [
      row(failed, 30, { profile: PROFILE, claim: 'mass_distilled_independent_evaluation_completed', evaluationPassed: false, safety: { passed: false } }),
      row(returnedBefore, 50, { profile: QUARANTINE_RESOLUTION_PROFILE, claim: QUARANTINE_RETURNED_CLAIM }),
    ],
    cos_university_distilled_evaluation_runs: [],
    cos_university_residency_enrollments: [],
  })
  const result = await resolveQuarantine({ db, now })
  assert.equal(result.quarantined, 3)
  assert.equal(result.dismissed, 1)
  assert.equal(result.returnedToExam, 1)
  assert.equal(result.heldForInvestigation, 1)
  const status = (id: string) => tables.cos_local_distillation_artifacts.find(item => item.id === id)?.status
  assert.equal(status('1'), 'retired', 'the exam FAIL leaves the University')
  assert.equal(status('2'), 'evaluation_ready', 'mass quarantine returns to governed evaluator admission')
  assert.equal(status('3'), 'quarantined', 'already returned once: held for investigation, not looped')
  assert.equal(status('4'), 'evaluation_pending', 'students outside quarantine are never touched')
  const dismissal = tables.cos_university_learning_assurance_events.find(item => item.evidence?.claim === QUARANTINE_DISMISSED_CLAIM)
  assert.equal(dismissal.evidence.reason, 'exam_failed')
  assert.deepEqual(dismissal.evidence.failedGates, ['safety'])
  assert.equal(dismissal.evidence.evaluationPassed, false)
  assert.equal(dismissal.evidence.productionTrafficAuthorized, false)
  assert.equal(tables.cos_university_learning_assurance_events.some(item => item.evidence?.claim === QUARANTINE_RETURNED_CLAIM && item.candidate_id === unknown.candidateId), true)

  const again = await resolveQuarantine({ db, now })
  assert.equal(again.dismissed + again.returnedToExam, 0, 'a second run changes nothing')
  assert.ok(QUARANTINE_RESOLUTION_MAX_PER_RUN >= 100)
})

test('the resolution runs every 15 minutes after the review, and removed students keep no endpoint and stay removed', () => {
  const route = read('app/api/cron/cos-university-mass-backlog-compact/route.ts')
  const review = route.indexOf('await reviewQuarantine()')
  const resolution = route.indexOf('await resolveQuarantineStep()')
  assert.ok(review > 0 && resolution > review && resolution < route.indexOf('await compactMassEvaluationBacklog('))
  assert.match(route, /lane:QUARANTINE_RESOLUTION_LANE,outcome:'failed'/)
  const resolver = read('lib/ai/cos/cosUniversityQuarantineResolution.ts')
  assert.match(resolver, /\.eq\('status', 'quarantined'\)\s+\.select\('id'\)/, 'conditional on still being quarantined')
  assert.doesNotMatch(resolver, /\.delete\(/, 'a status, never a wipe: weights and exam records stay as proof')
  assert.doesNotMatch(resolver, /from '\.\/runpod|callLocalModel\(|activateMassDistilled|fetch\(/, 'the resolution spends nothing')
  assert.match(read('lib/ai/cos/runpodMassDistilledEndpointGc.ts'), /TERMINAL_ARTIFACT_STATUSES = \['quarantined', 'retired'\]/)
  assert.match(read('lib/ai/cos/cosLocalDistillationPolicy.ts'), /existingStatus === 'retired'\) \{\s+status = existingStatus/)
})

test('the dashboard shows the resolution, WHY students fail, and who left the University, in all five languages', () => {
  const api = read('app/api/admin/cos-university-telemetry/route.ts')
  assert.match(api, /\.eq\('lane', QUARANTINE_RESOLUTION_LANE\)/)
  assert.match(api, /currentStage = 'Left the University'/)
  assert.match(api, /row\.standing === 'residency_failed'\s+&& artifactRowsByKey\.get\(row\.candidateId \+ ':' \+ row\.artifactHash\)\?\.status === 'quarantined'/)
  const page = read('app/dashboard/cos-university-telemetry/page.tsx')
  for (const key of ['whyTitle', 'whySafety', 'whyResidency', 'whyErrors', 'leftTitle', 'leftUnexaminable', 'resolutionLast', 'resolutionNever']) {
    assert.match(page, new RegExp(`copy\\.${key}\\b`))
  }
  assert.match(page, /residencyInUniversity\.map\(row =>/)
  const copy = read('lib/i18n/cosUniversityTelemetryCopy.ts')
  for (const key of ['leftTitle', 'leftExplanation', 'whyTitle', 'whyHoldout', 'whyErrors', 'resolutionFailed', 'resolutionHeld']) {
    assert.equal(copy.match(new RegExp(`\\n    ${key}: `, 'g'))?.length, 5, `${key} in en, es, pt, pl, ru`)
  }
})


test('mass quarantine returns through governed evaluation admission', () => {
  const resolver = read('lib/ai/cos/cosUniversityQuarantineResolution.ts')
  assert.match(resolver, /student\.candidateId\.startsWith\('mass:'\) \? 'evaluation_ready' : 'evaluation_pending'/)
})
