// saas/tests/universityQuarantineLedger.node.test.ts
//
// Owner direction 2026-09-30: deal with the students in quarantine. Every quarantined student gets its reason
// named from the durable events; FAILs stay final results, students held back by our own errors are shown as ours,
// and the owner can see on the dashboard whether the quarantine review is returning them to the exam.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  FINAL_QUARANTINE_REASONS,
  QUARANTINE_RESTORED_CLAIM,
  QUARANTINE_REVIEW_LANE,
  QUARANTINE_REVIEW_PROFILE,
  classifyQuarantinedStudent,
  quarantineNextAction,
  summarizeQuarantine,
  type QuarantineStudent,
} from '../lib/ai/cos/cosUniversityQuarantineReasons.ts'
import { MASS_EVALUATION_ROLLING_AUTHORIZATION_REF, type RollingEvent } from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const now = new Date('2026-09-30T04:00:00.000Z')
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString()
const PROFILE = 'cos_mass_distilled_independent_evaluation_runtime_v1'

function student(id: string, status = 'quarantined', extra: Partial<QuarantineStudent> = {}): QuarantineStudent {
  return { candidateId: `mass:${id}`, subjectId: 'History', artifactHash: id.repeat(64).slice(0, 64), createdAt: minutesAgo(5000), status, ...extra }
}
function event(s: QuarantineStudent, minutes: number, evidence: Record<string, unknown>, verifier = 'host_controller'): RollingEvent {
  return { candidateId: s.candidateId, observedAt: minutesAgo(minutes), expiresAt: null, verifier, evidence: { artifactHash: s.artifactHash, ...evidence } }
}
function exhausted(s: QuarantineStudent, errors: readonly string[], lastError = errors[errors.length - 1] || ''): RollingEvent[] {
  const approval: RollingEvent = { candidateId: s.candidateId, observedAt: minutesAgo(900), expiresAt: minutesAgo(780), verifier: 'host_controller',
    evidence: { artifactHash: s.artifactHash, authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF } }
  return [
    approval,
    ...errors.map((error, index) => event(s, 800 - index * 60, { profile: PROFILE, claim: 'mass_distilled_independent_evaluation_failed', error })),
    event(s, 400, { profile: PROFILE, claim: 'mass_distilled_evaluation_attempts_exhausted', lastError }),
  ]
}
const classify = (s: QuarantineStudent, events: RollingEvent[]) => classifyQuarantinedStudent({ student: s, events, now })

test('a student that sat the exam and failed on merit is a final result', () => {
  const s = student('a')
  const result = classify(s, [event(s, 100, { profile: PROFILE, claim: 'mass_distilled_independent_evaluation_completed', evaluationPassed: false })])
  assert.equal(result.reason, 'exam_failed')
  assert.equal(result.final, true)
})

test('a Residency FAIL is a final result, from its event or from the standing alone', () => {
  const s = student('b')
  assert.equal(classify(s, [event(s, 50, { profile: 'cos_builder_residency_final_disposition_v1', claim: 'builder_residency_failed' })]).reason, 'residency_failed')
  assert.equal(classify(student('c', 'quarantined', { residencyStanding: 'residency_failed' }), []).reason, 'residency_failed')
})

test('three real exam failures are final; three failures that were OURS are not', () => {
  const real = student('d')
  const realResult = classify(real, exhausted(real, ['mass_distilled_evaluation_holdout_regressed', 'mass_distilled_evaluation_safety_failed', 'mass_distilled_evaluation_transfer_failed']))
  assert.equal(realResult.reason, 'exhausted_real_failures')
  assert.equal(realResult.final, true)

  const ours = student('e')
  const oursResult = classify(ours, exhausted(ours, ['runpod patch /serverless/x http 500: control plane', 'mass_distilled_evaluation_runtime_not_ready:network', 'cannot read properties of undefined (reading \'length\')']))
  assert.equal(oursResult.reason, 'exhausted_our_errors')
  assert.equal(oursResult.final, false)
})

test('broken frozen exam data is ours, never a FAIL', () => {
  const s = student('f')
  assert.equal(classify(s, [event(s, 30, { profile: PROFILE, claim: 'mass_distilled_independent_evaluation_failed', error: 'mass_distilled_evaluation_holdout_format_invalid', terminalDataDefect: true })]).reason, 'exam_data_defect')
  const old = student('9')
  const defect = 'distilled_evaluation_hf_pinned_parquet_missing'
  const result = classify(old, exhausted(old, [defect, defect, defect]))
  assert.equal(result.reason, 'exam_data_defect', 'spent on the same frozen bytes before the defect was recognised as terminal')
  assert.equal(result.final, false)
})

test('a quarantined student with no recorded disposition is flagged, not guessed', () => {
  const result = classify(student('7'), [])
  assert.equal(result.reason, 'no_recorded_reason')
  assert.equal(result.final, false)
})

test('the newest result wins: returned to the exam, then failed on merit, is an exam FAIL', () => {
  const s = student('8')
  const events = [
    ...exhausted(s, ['mass_distilled_evaluation_runtime_not_ready:network']),
    event(s, 300, { profile: QUARANTINE_REVIEW_PROFILE, claim: QUARANTINE_RESTORED_CLAIM }),
    event(s, 60, { profile: PROFILE, claim: 'mass_distilled_independent_evaluation_completed', evaluationPassed: false }),
  ]
  assert.equal(classify(s, events).reason, 'exam_failed')
})

test('the summary counts every reason and follows every student the review returned to the exam', () => {
  const failed = student('1')
  const ours = student('2')
  const waiting = student('3', 'evaluation_pending')
  const passed = student('4', 'runtime_pending')
  const again = student('5')
  const byCandidate = new Map<string, RollingEvent[]>([
    [failed.candidateId, [event(failed, 10, { claim: 'mass_distilled_independent_evaluation_completed', evaluationPassed: false })]],
    [ours.candidateId, exhausted(ours, ['mass_distilled_evaluation_runtime_not_ready:network'])],
    [waiting.candidateId, [event(waiting, 20, { profile: QUARANTINE_REVIEW_PROFILE, claim: QUARANTINE_RESTORED_CLAIM })]],
    [passed.candidateId, [
      event(passed, 200, { profile: QUARANTINE_REVIEW_PROFILE, claim: QUARANTINE_RESTORED_CLAIM }),
      event(passed, 30, { claim: 'mass_distilled_independent_evaluation_completed', evaluationPassed: true }),
    ]],
    [again.candidateId, [
      event(again, 200, { profile: QUARANTINE_REVIEW_PROFILE, claim: QUARANTINE_RESTORED_CLAIM }),
      event(again, 30, { claim: 'mass_distilled_independent_evaluation_completed', evaluationPassed: false }),
    ]],
  ])
  const { summary, reasons } = summarizeQuarantine({
    students: [failed, ours, waiting, passed, again],
    eventsFor: id => byCandidate.get(id) || [],
    now,
  })
  assert.equal(summary.total, 3)
  assert.equal(summary.byReason.exam_failed, 2)
  assert.equal(summary.byReason.exhausted_our_errors, 1)
  assert.equal(summary.finalResults, 2)
  assert.equal(summary.pendingCorrection, 1)
  assert.deepEqual({ ...summary.returnedToExam }, { total: 3, waitingForExam: 1, passedExam: 1, quarantinedAgain: 1, other: 0 })
  assert.equal(reasons.size, 3)
  assert.deepEqual([...FINAL_QUARANTINE_REASONS].sort(), ['exam_failed', 'exhausted_real_failures', 'residency_failed'])
  assert.match(quarantineNextAction('exam_failed'), /final/)
  assert.match(quarantineNextAction('exhausted_our_errors'), /Returns to the exam/)
})

test('the review reads the quarantine in bounded chunks and keeps its narrow restore contract', () => {
  const review = read('lib/ai/cos/cosUniversityMassQuarantineReview.ts')
  assert.match(review, /const CANDIDATE_CHUNK=75/)
  assert.equal(review.match(/for\(const chunk of candidateChunks\(candidateIds\)\)\{/g)?.length, 2, 'artifacts and events are both chunked')
  assert.doesNotMatch(review, /\.in\('candidate_id',disposedIds\)/)
  assert.doesNotMatch(review, /\.in\('candidate_id',\[\.\.\.candidateIds\]\)/)
  assert.match(review, /\.range\(from,from\+PAGE_SIZE-1\)/, 'the disposed list is paginated')
  assert.match(review, new RegExp(`REVIEW_PROFILE='${QUARANTINE_REVIEW_PROFILE}'`))
  assert.match(review, new RegExp(`RESTORED='${QUARANTINE_RESTORED_CLAIM}'`))
  assert.match(read('app/api/cron/cos-university-mass-backlog-compact/route.ts'), new RegExp(`REVIEW_LANE='${QUARANTINE_REVIEW_LANE}'`))
})

test('telemetry names the reason for every quarantined student and reports the review lane', () => {
  const route = read('app/api/admin/cos-university-telemetry/route.ts')
  assert.match(route, /summarizeQuarantine\(\{ students: quarantineStudents, eventsFor: rollingEventsFor, now: new Date\(\) \}\)/)
  assert.match(route, /\.eq\('lane', QUARANTINE_REVIEW_LANE\)/)
  assert.match(route, /quarantine: \{\s+\.\.\.quarantine\.summary,/)
  const quarantined = route.indexOf("else if (artifact.status === 'quarantined') { currentStage = 'Quarantine'")
  assert.ok(quarantined > 0 && quarantined < route.indexOf("else if (residencyState?.standing === 'residency_complete')"),
    'a student that finished Residency and then failed its exam is shown as a result, not as waiting for a canary')
  assert.doesNotMatch(route, /Retrain on the failed Residency competencies/, 'there is no retraining path; a Residency FAIL is final')
})

test('the dashboard shows the quarantine breakdown in all five languages', () => {
  const page = read('app/dashboard/cos-university-telemetry/page.tsx')
  for (const key of ['quarantineTitle', 'quarantineFinal', 'quarantinePending', 'quarantineExhaustedOurs', 'quarantineDataDefect', 'quarantineReturned', 'quarantineReviewNever']) {
    assert.match(page, new RegExp(`copy\\.${key}\\b`))
  }
  const copy = read('lib/i18n/cosUniversityTelemetryCopy.ts')
  for (const key of ['quarantineTitle', 'quarantineExplanation', 'quarantineExamFailed', 'quarantineExhaustedOurs', 'quarantineDataDefect', 'quarantineReviewFailed']) {
    assert.equal(copy.match(new RegExp(`\\n    ${key}: `, 'g'))?.length, 5, `${key} in en, es, pt, pl, ru`)
  }
})
