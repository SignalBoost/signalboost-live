// saas/tests/universityStrandedComputerScience.node.test.ts
//
// Production 2026-10-07: INDEPENDENT_EVALUATION held Computer Science students ~99 hours with no exit. They reached
// `evaluation_pending` under the pre-2026-10-03 Residency flow and then had no completed Residency, so the exam claim
// and the exam lane's disposition both skipped them forever. Each gets the exit its Residency record calls for; no
// standard is lowered and nobody is examined, scored or promoted here.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { QUARANTINE_DISMISSED_CLAIM, QUARANTINE_REASONS, QUARANTINE_RESOLUTION_PROFILE, quarantineNextAction } from '../lib/ai/cos/cosUniversityQuarantineReasons.ts'
import { STRANDED_RETURNED_TO_RESIDENCY_CLAIM, resolveStrandedComputerScienceExamStudents } from '../lib/ai/cos/cosUniversityQuarantineResolution.ts'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const hashOf = (id: string) => id.repeat(64).slice(0, 64)
const CS = 'Computer Science & Coding'

function fakeDb(tables: Record<string, any[]>) {
  const from = (table: string) => {
    const filters: Array<(row: any) => boolean> = []
    let mode: 'select' | 'update' | 'upsert' = 'select'
    let patch: any = null
    let window: [number, number] | null = null
    const builder: any = {
      select: () => builder,
      eq: (column: string, value: unknown) => { filters.push(row => row[column] === value); return builder },
      in: (column: string, values: unknown[]) => { filters.push(row => values.includes(row[column])); return builder },
      order: () => builder,
      range: (a: number, b: number) => { window = [a, b]; return builder },
      limit: () => builder,
      update: (value: any) => { mode = 'update'; patch = value; return builder },
      upsert: (value: any) => { mode = 'upsert'; patch = value; return builder },
      then: (resolve: (value: any) => unknown) => {
        const rows = tables[table] || (tables[table] = [])
        if (mode === 'upsert') {
          if (!rows.some(row => row.event_key === patch.event_key)) rows.push(patch)
          return Promise.resolve(resolve({ data: null, error: null }))
        }
        const matched = rows.filter(row => filters.every(filter => filter(row)))
        if (mode === 'update') {
          for (const row of matched) Object.assign(row, patch)
          return Promise.resolve(resolve({ data: matched.map(row => ({ id: row.id })), error: null }))
        }
        return Promise.resolve(resolve({ data: window ? matched.slice(window[0], window[1] + 1) : matched, error: null }))
      },
    }
    return builder
  }
  return { from }
}

const artifact = (id: string, subject = CS, status = 'evaluation_pending') => ({
  id, candidate_id: `mass:${id}`, subject_id: subject, trained_artifact_hash: hashOf(id), status, updated_at: '2026-10-03T19:00:00.000Z',
})
const enrollment = (id: string, standing: string, extra: Record<string, unknown> = {}) => ({
  candidate_id: `mass:${id}`, trained_artifact_hash: hashOf(id), standing, completed_at: null, authority_expanded: false, ...extra,
})

test('every stranded Computer Science exam student gets the exit its Residency record calls for', async () => {
  const tables: Record<string, any[]> = {
    cos_local_distillation_artifacts: [
      artifact('1'), artifact('2'), artifact('3'), artifact('4'), artifact('5'),
      artifact('6', 'History'), artifact('7', CS, 'evaluation_ready'),
    ],
    cos_university_residency_enrollments: [
      enrollment('2', 'residency_failed'),
      enrollment('3', 'withdrawn'),
      enrollment('4', 'resident'),
      enrollment('5', 'residency_complete', { completed_at: '2026-10-06T00:00:00.000Z' }),
    ],
    cos_university_learning_assurance_events: [],
  }
  const result = await resolveStrandedComputerScienceExamStudents({ db: fakeDb(tables) })
  assert.deepEqual({ ...result }, { checked: 5, returnedToResidency: 1, retiredResidencyFailed: 1, retiredResidencyNotCompletable: 1, keptInResidency: 1, examinable: 1 })

  const status = (id: string) => tables.cos_local_distillation_artifacts.find(row => row.id === id)?.status
  assert.equal(status('1'), 'evaluation_ready', 'never enrolled: back to where Residency admits it')
  assert.equal(status('2'), 'retired', 'Residency FAIL is a final result')
  assert.equal(status('3'), 'retired', 'a withdrawn enrollment can never complete')
  assert.equal(status('4'), 'evaluation_pending', 'an active Residency is left alone')
  assert.equal(status('5'), 'evaluation_pending', 'a completed Residency stays for the exam to claim')
  assert.equal(status('6'), 'evaluation_pending', 'other subjects are untouched')
  assert.equal(status('7'), 'evaluation_ready', 'only students waiting at the exam are considered')

  const records = new Map(tables.cos_university_learning_assurance_events.map(row => [row.candidate_id, row.evidence]))
  assert.equal(records.size, 3)
  assert.equal(records.get('mass:1').claim, STRANDED_RETURNED_TO_RESIDENCY_CLAIM)
  assert.equal(records.get('mass:2').claim, QUARANTINE_DISMISSED_CLAIM)
  assert.equal(records.get('mass:2').reason, 'residency_failed')
  assert.equal(records.get('mass:2').ours, false, 'a Residency FAIL is the student result')
  assert.equal(records.get('mass:3').reason, 'residency_not_completable')
  assert.equal(records.get('mass:3').ours, true, 'withdrawn by our flow change: ours, never a FAIL')
  for (const evidence of records.values()) {
    assert.equal(evidence.profile, QUARANTINE_RESOLUTION_PROFILE)
    assert.equal(evidence.evaluationPassed, false)
    assert.equal(evidence.productionTrafficAuthorized, false)
    assert.equal(evidence.authorityExpanded, false)
  }

  const again = await resolveStrandedComputerScienceExamStudents({ db: fakeDb(tables) })
  assert.equal(again.returnedToResidency + again.retiredResidencyFailed + again.retiredResidencyNotCompletable, 0, 'a second run changes nothing')
  assert.equal(tables.cos_university_learning_assurance_events.length, 3)
})

test('a completed Residency the exam claim would refuse is not treated as complete', async () => {
  const tables: Record<string, any[]> = {
    cos_local_distillation_artifacts: [artifact('8')],
    cos_university_residency_enrollments: [enrollment('8', 'residency_complete', { completed_at: '2026-10-06T00:00:00.000Z', authority_expanded: true })],
    cos_university_learning_assurance_events: [],
  }
  const result = await resolveStrandedComputerScienceExamStudents({ db: fakeDb(tables) })
  assert.equal(result.examinable, 0)
  assert.equal(result.retiredResidencyNotCompletable, 1)
})

test('the dashboard counts it as not examinable (ours), and the resolution runs before compaction and spends nothing', () => {
  assert.ok((QUARANTINE_REASONS as readonly string[]).includes('residency_not_completable'))
  assert.match(quarantineNextAction('residency_not_completable'), /ours, not a FAIL/)
  const page = read('app/dashboard/cos-university-telemetry/page.tsx')
  assert.match(page, /\(leftReasons\.residency_not_completable \?\? 0\)/)
  const route = read('app/api/cron/cos-university-mass-backlog-compact/route.ts')
  assert.ok(route.indexOf('await resolveStrandedComputerScienceExamStudents(') > 0)
  assert.ok(route.indexOf('await resolveStrandedComputerScienceExamStudents(') < route.indexOf('await compactMassEvaluationBacklog('))
  const resolver = read('lib/ai/cos/cosUniversityQuarantineResolution.ts')
  assert.doesNotMatch(resolver, /\.delete\(|fetch\(|callLocalModel\(/)
})
