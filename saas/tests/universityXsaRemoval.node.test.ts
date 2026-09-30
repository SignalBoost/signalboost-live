//
// Owner direction 2026-09-30 ("remove them"): the 50 XSA students whose exams are paused because our XSA server is too
// slow for the exam leave the University as OUR failure, never as a FAIL. Standard students, students in an active
// Residency and every other status are untouched, and the removal stops as soon as XSA exams are unpaused.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { MASS_XSA_EXAMS_PAUSED } from '../lib/ai/cos/cosUniversityXsaExamPause.ts'
import { QUARANTINE_DISMISSED_CLAIM, QUARANTINE_REASONS, QUARANTINE_RESOLUTION_PROFILE, quarantineNextAction, summarizeQuarantine } from '../lib/ai/cos/cosUniversityQuarantineReasons.ts'
import { retireUnexaminableXsaStudents } from '../lib/ai/cos/cosUniversityQuarantineResolution.ts'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const hashOf = (id: string) => id.repeat(64).slice(0, 64)

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

const artifact = (id: string, xsa: boolean, status = 'evaluation_pending') => ({
  id, candidate_id: `mass:${id}`, subject_id: 'History', trained_artifact_hash: hashOf(id), status, updated_at: '2026-09-29T00:00:00.000Z',
  intended_use: { trainingReceipt: { xsaTrainingApplied: xsa } },
})

test('paused XSA students leave the University as OUR failure; everyone else is untouched', async () => {
  assert.equal(MASS_XSA_EXAMS_PAUSED, true, 'this removal exists only because XSA exams are paused')
  const tables: Record<string, any[]> = {
    cos_local_distillation_artifacts: [
      artifact('1', true), artifact('2', true), artifact('3', false), artifact('4', true, 'quarantined'), artifact('5', true),
    ],
    cos_university_residency_enrollments: [{ candidate_id: 'mass:5', trained_artifact_hash: hashOf('5'), standing: 'resident' }],
    cos_university_learning_assurance_events: [],
  }
  const result = await retireUnexaminableXsaStudents({ db: fakeDb(tables) })
  assert.deepEqual({ ...result }, { paused: true, checked: 3, removed: 2, keptInResidency: 1 })
  const status = (id: string) => tables.cos_local_distillation_artifacts.find(row => row.id === id)?.status
  assert.equal(status('1'), 'retired')
  assert.equal(status('2'), 'retired')
  assert.equal(status('3'), 'evaluation_pending', 'a standard student keeps waiting for its exam')
  assert.equal(status('4'), 'quarantined', 'only students waiting for an exam are considered')
  assert.equal(status('5'), 'evaluation_pending', 'a student inside an active Residency is left alone')
  const records = tables.cos_university_learning_assurance_events
  assert.equal(records.length, 2)
  for (const record of records) {
    assert.equal(record.evidence.profile, QUARANTINE_RESOLUTION_PROFILE)
    assert.equal(record.evidence.claim, QUARANTINE_DISMISSED_CLAIM)
    assert.equal(record.evidence.reason, 'xsa_not_examinable')
    assert.equal(record.evidence.ours, true, 'recorded as our failure')
    assert.equal(record.evidence.evaluationPassed, false)
    assert.equal(record.evidence.productionTrafficAuthorized, false)
  }
  const again = await retireUnexaminableXsaStudents({ db: fakeDb(tables) })
  assert.equal(again.removed, 0, 'a second run changes nothing')
})

test('the dashboard counts removed XSA students under "not examinable — ours", never as a FAIL', () => {
  assert.ok((QUARANTINE_REASONS as readonly string[]).includes('xsa_not_examinable'))
  assert.match(quarantineNextAction('xsa_not_examinable'), /ours, not a FAIL/)
  const s = { candidateId: 'mass:9', subjectId: 'History', artifactHash: hashOf('9'), createdAt: '2026-09-28T00:00:00.000Z', status: 'retired' }
  const dismissal = { candidateId: s.candidateId, observedAt: '2026-09-30T06:00:00.000Z', expiresAt: null, verifier: 'host_controller',
    evidence: { profile: QUARANTINE_RESOLUTION_PROFILE, claim: QUARANTINE_DISMISSED_CLAIM, artifactHash: s.artifactHash, reason: 'xsa_not_examinable', ours: true, failedGates: [], failedCompetencies: [] } }
  const { summary } = summarizeQuarantine({ students: [s], eventsFor: () => [dismissal], now: new Date('2026-09-30T06:10:00.000Z') })
  assert.equal(summary.leftUniversity.byReason.xsa_not_examinable, 1)
  assert.equal(summary.leftUniversity.byReason.exam_failed, 0)
  const page = read('app/dashboard/cos-university-telemetry/page.tsx')
  assert.match(page, /\(leftReasons\.exam_data_defect \?\? 0\) \+ \(leftReasons\.xsa_not_examinable \?\? 0\)/)
})

test('the removal runs in the 15-minute resolution, only while XSA exams are paused, and spends nothing', () => {
  const route = read('app/api/cron/cos-university-mass-backlog-compact/route.ts')
  assert.ok(route.indexOf('await resolveQuarantine(') < route.indexOf('await retireUnexaminableXsaStudents('))
  assert.ok(route.indexOf('await retireUnexaminableXsaStudents(') < route.indexOf('await compactMassEvaluationBacklog('))
  const resolver = read('lib/ai/cos/cosUniversityQuarantineResolution.ts')
  assert.match(resolver, /if \(!MASS_XSA_EXAMS_PAUSED\) return/)
  assert.match(resolver, /\.eq\('status', 'evaluation_pending'\)\s+\.select\('id'\)/, 'conditional on still waiting for the exam')
  assert.doesNotMatch(resolver, /\.delete\(|fetch\(|callLocalModel\(/)
})