// saas/tests/cosUniversityComputerSciencePath.node.test.ts
//
// The Computer Science path snapshot in the Step 1 report (owner go 2026-10-06): where the newest Computer Science
// artifact is between training dispatch and Builder Residency, and whether it carried Builder protocol practice.
// Read only, through readOnlyDb; these tests pin what each line is counted from.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { describeComputerSciencePath, readComputerSciencePath } from '../lib/ai/cos/cosUniversityComputerSciencePath.ts'
import { readOnlyDb } from '../lib/ai/cos/cosUniversityReadOnlyDb.ts'
import { BUILDER_PROTOCOL_PRACTICE_PROFILE } from '../lib/ai/cos/cosUniversityBuilderProtocolPractice.ts'

type Row = Record<string, any>
const CS = 'Computer Science & Coding'
const practiceReceipt = { trainingReceipt: { builderProtocolPracticeProfile: BUILDER_PROTOCOL_PRACTICE_PROFILE, builderProtocolPracticeRowsHash: 'a'.repeat(64) } }

/** A PostgREST-shaped fake: filters are applied, so a wrong filter in the module changes the numbers. */
function fakeDb(tables: Record<string, Row[]>) {
  const read = (row: Row, column: string) => column.split(/->>|->/).reduce((value: any, key) => value?.[key], row)
  return {
    from(table: string) {
      let list = [...(tables[table] || [])]
      let head = false
      const builder: any = {
        select: (_columns: string, options?: { head?: boolean }) => { head = options?.head === true; return builder },
        gte: (column: string, value: number) => { list = list.filter(row => Number(read(row, column)) >= value); return builder },
        not: (column: string, operator: string, value: unknown) => {
          assert.equal(operator, 'is'); assert.equal(value, null)
          list = list.filter(row => read(row, column) !== undefined && read(row, column) !== null)
          return builder
        },
        eq: (column: string, value: unknown) => { list = list.filter(row => read(row, column) === value); return builder },
        like: (column: string, pattern: string) => { list = list.filter(row => String(row[column]).startsWith(pattern.replace('%', ''))); return builder },
        in: (column: string, values: unknown[]) => { list = list.filter(row => values.includes(row[column])); return builder },
        order: (column: string, options: { ascending: boolean }) => {
          list.sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (options.ascending ? 1 : -1))
          return builder
        },
        limit: (count: number) => { list = list.slice(0, count); return builder },
        range: (from: number, to: number) => { list = list.slice(from, to + 1); return builder },
        then: (resolve: (value: unknown) => void) => resolve(head ? { count: list.length, error: null } : { data: list, error: null }),
      }
      return builder
    },
  }
}

const tables: Record<string, Row[]> = {
  cos_continuous_learning: [
    ...Array.from({ length: 30 }, (_, i) => ({ content_hash: `r${i}`, subject: CS, confidence: 0.9, source_kind: 'open_source_document' })),
    ...Array.from({ length: 50 }, (_, i) => ({ content_hash: `f${i}`, subject: CS, confidence: 0.9, source_kind: 'failure_derived_curriculum' })),
    ...Array.from({ length: 10 }, (_, i) => ({ content_hash: `t${i}`, subject: CS, confidence: 0.9, source_kind: 'teacher_hosted_curriculum' })),
    // Not counted: below confidence, another subject.
    { content_hash: 'low', subject: CS, confidence: 0.5, source_kind: 'open_source_document' },
    { content_hash: 'math', subject: 'Mathematics', confidence: 0.9, source_kind: 'open_source_document' },
  ],
  cos_university_distillation_curriculum_batches: [
    { subject_id: CS, status: 'consumed', prepared_at: '2026-10-05T19:00:00Z' },
    { subject_id: CS, status: 'superseded', prepared_at: '2026-10-04T19:00:00Z' },
    { subject_id: 'Mathematics', status: 'prepared', prepared_at: '2026-10-06T19:00:00Z' },
  ],
  cos_university_learning_assurance_events: [
    { event_type: 'production_path', path_id: 'mass_distillation_campaign', observed_at: '2026-10-06T19:05:00Z', evidence: {
      curriculum: { supply: { subjects: [
        { subject: 'Mathematics', canonicalSubjectId: 'mathematics', uniqueBatchableItems: 400, shortfallToBatch: 0 },
        { subject: CS, canonicalSubjectId: 'computer_science', uniqueBatchableItems: 41, shortfallToBatch: 23, realSourceItems: 12, realSourceNeeded: 32 },
      ] } },
      preparedBufferTarget: 12, preparedBeforeReplenishment: 12,
      curriculumReplenishment: { ok: true, skipped: true, reason: 'prepared_buffer_satisfied' },
    } },
    // An older receipt and a receipt without a packaging pass are not the latest packaging evidence.
    { event_type: 'production_path', path_id: 'mass_distillation_campaign', observed_at: '2026-10-06T18:00:00Z', evidence: { curriculum: { supply: { subjects: [] } } } },
    { event_type: 'production_path', path_id: 'mass_distillation_campaign', observed_at: '2026-10-06T19:10:00Z', evidence: { curriculum: { ok: true, skipped: true } } },
    { subject_id: CS, observed_at: '2026-10-06T19:00:00Z', evidence: { claim: 'mass_distillation_pre_dispatch_validated', stage: 'training_dispatching', builderProtocolPractice: { profile: BUILDER_PROTOCOL_PRACTICE_PROFILE, taskIds: ['tsn-count-return-type', 'rwid-greeting-export'] } } },
    { subject_id: CS, observed_at: '2026-10-06T10:00:00Z', evidence: { claim: 'mass_distillation_pre_dispatch_validated', stage: 'training_dispatching', builderProtocolPractice: null } },
    // Not counted: another stage, another subject.
    { subject_id: CS, observed_at: '2026-10-06T19:30:00Z', evidence: { claim: 'mass_distillation_pre_dispatch_validated', stage: 'teacher_dispatching' } },
    { subject_id: 'Mathematics', observed_at: '2026-10-06T19:40:00Z', evidence: { claim: 'mass_distillation_pre_dispatch_validated', stage: 'training_dispatching' } },
  ],
  cos_university_mass_distillation_batch_runs: [
    { subject_id: CS, stage: 'training_dispatched', created_at: '2026-10-06T18:55:00Z', updated_at: '2026-10-06T19:00:00Z' },
    { subject_id: CS, stage: 'evaluated', created_at: '2026-10-05T08:00:00Z', updated_at: '2026-10-05T12:00:00Z' },
    { subject_id: 'Mathematics', stage: 'training_dispatched', created_at: '2026-10-06T19:10:00Z', updated_at: '2026-10-06T19:10:00Z' },
  ],
  cos_local_distillation_artifacts: [
    { id: 'art-new', candidate_id: 'mass:new', subject_id: CS, status: 'evaluation_ready', created_at: '2026-10-06T20:00:00Z', intended_use: practiceReceipt },
    { id: 'art-old', candidate_id: 'mass:old', subject_id: CS, status: 'evaluation_ready', created_at: '2026-10-04T08:00:00Z', intended_use: {} },
    { id: 'art-enrolled', candidate_id: 'mass:enrolled', subject_id: CS, status: 'evaluation_ready', created_at: '2026-10-05T08:00:00Z', intended_use: {} },
    { id: 'art-graduated', candidate_id: 'mass:grad', subject_id: CS, status: 'graduated', created_at: '2026-10-03T08:00:00Z', intended_use: {} },
    { id: 'art-working', candidate_id: 'working:x', subject_id: CS, status: 'evaluation_ready', created_at: '2026-10-06T21:00:00Z', intended_use: practiceReceipt },
  ],
  cos_university_residency_enrollments: [
    { id: 'res-1', artifact_row_id: 'art-enrolled', standing: 'residency_failed' },
    { id: 'res-2', artifact_row_id: 'art-graduated', standing: 'resident' },
  ],
  cos_university_residency_case_runs: [
    { status: 'failed', started_at: '2026-10-06T17:00:00Z', completed_at: '2026-10-06T17:04:00Z', metadata: { builderLoop: { outcome: 'incomplete', failureCode: 'builder_round_budget_exhausted' } } },
    { status: 'failed', started_at: '2026-10-05T23:00:00Z', completed_at: '2026-10-05T23:03:00Z', metadata: {} },
    { status: 'passed', started_at: '2026-10-05T22:00:00Z', completed_at: '2026-10-05T22:02:00Z', metadata: {} },
  ],
}

test('the snapshot follows the newest Computer Science artifact from dispatch to Residency', async () => {
  const path = await readComputerSciencePath({ db: readOnlyDb(fakeDb(tables)), now: new Date('2026-10-06T21:30:00Z') })
  assert.deepEqual({ ...path.trainingDispatches, latestPracticeTaskIds: [...path.trainingDispatches.latestPracticeTaskIds] }, {
    recent: 2, withPractice: 1, latestAt: '2026-10-06T19:00:00.000Z', latestWithPractice: true,
    latestPracticeTaskIds: ['tsn-count-return-type', 'rwid-greeting-export'],
  })
  assert.deepEqual({ ...path.packaging, curriculumBatchesByStatus: { ...path.packaging.curriculumBatchesByStatus }, corpusRowsByOrigin: { ...path.packaging.corpusRowsByOrigin } }, {
    receiptAt: '2026-10-06T19:05:00.000Z', supplyItems: 41, supplyShortfall: 23, realSourceItems: 12, realSourceNeeded: 32, batchMinimum: 64,
    preparedBufferTarget: 12, preparedBefore: 12, replenishment: 'prepared_buffer_satisfied skipped',
    curriculumBatchesByStatus: { consumed: 1, superseded: 1 }, latestCurriculumBatchAt: '2026-10-05T19:00:00.000Z',
    corpusRowsByOrigin: { realSource: 30, failureDerived: 50, teacherSynthetic: 10 },
  })
  assert.equal(path.trainingRuns.recent, 2)
  assert.equal(path.trainingRuns.latestStage, 'training_dispatched')
  assert.deepEqual({ ...path.trainedArtifacts.byStatus }, { evaluation_ready: 3, graduated: 1 }, 'mass artifacts only')
  assert.equal(path.trainedArtifacts.trainedWithPractice, 1)
  assert.equal(path.trainedArtifacts.latestWithPractice, true)
  // Waiting = evaluation_ready, mass, not enrolled; the enrolled one is excluded even though its resident failed.
  assert.equal(path.residency.awaitingAdmission, 2)
  assert.equal(path.residency.awaitingAdmissionWithPractice, 1)
  assert.equal(path.residency.activeResidents, 1)
  assert.equal(path.residency.latestCaseStartedAt, '2026-10-06T17:00:00.000Z')
  assert.equal(path.residency.recentFailedCases, 2)
  assert.equal(path.residency.recentFailedCasesWithLoopStop, 1)
  const text = describeComputerSciencePath(path)
  assert.match(text, /training dispatches :: recent=2 withProtocolPractice=1 .*latestWithPractice=yes latestTasks=tsn-count-return-type,rwid-greeting-export/)
  assert.match(text, /residency +:: awaitingAdmission=2 \(withPractice=1\) activeResidents=1 latestCaseStartedAt=2026-10-06T17:00:00.000Z/)
  assert.match(text, /recentFailed=2 recentFailedWithLoopStop=1/)
  assert.match(text, /packaging +:: receiptAt=2026-10-06T19:05:00.000Z supply=41 batchable items \(needs 64; shortfall 23\) realSource=12\/32 BLOCKED: too little real-source material preparedBuffer=12\/12 replenishment=prepared_buffer_satisfied skipped curriculumBatches=consumed=1,superseded=1 .*real=30 failureDerived=50 teacherSynthetic=10/)
})

test('an empty path says none rather than inventing a state', async () => {
  const path = await readComputerSciencePath({ db: readOnlyDb(fakeDb({})), now: new Date('2026-10-06T21:30:00Z') })
  assert.equal(path.trainingDispatches.latestWithPractice, null)
  assert.equal(path.residency.awaitingAdmission, 0)
  assert.match(describeComputerSciencePath(path), /latestAt=none latestWithPractice=n\/a/)
  assert.match(describeComputerSciencePath(path), /supply=no packaging receipt/)
})

test('a fill that actually ran prints its targets and yield instead of n/a', async () => {
  const path = await readComputerSciencePath({ db: readOnlyDb(fakeDb({
    cos_university_learning_assurance_events: [{ event_type: 'production_path', path_id: 'mass_distillation_campaign', observed_at: '2026-10-07T15:26:56Z', evidence: {
      curriculum: { supply: { subjects: [{ subject: CS, canonicalSubjectId: 'computer_science', uniqueBatchableItems: 678, shortfallToBatch: 0, realSourceItems: 28, realSourceNeeded: 32 }] } },
      curriculumReplenishment: { ok: true, skipped: false, targets: [CS, 'Mathematics'], documentsAcquired: 40, accepted: 0, probationary: 1, rejected: { duplicate: 37, off_topic: 2, rights: 0 }, sourceErrors: { openalex: 2, hf_nist_cc0: 0 } },
    } }],
  })), now: new Date('2026-10-07T15:30:00Z') })
  assert.equal(path.packaging.replenishment, 'ran targets=[Computer Science & Coding; Mathematics] acquired=40 accepted=0 probationary=1 rejected=duplicate=37,off_topic=2 sourceErrors=openalex=2')
  const failed = await readComputerSciencePath({ db: readOnlyDb(fakeDb({
    cos_university_learning_assurance_events: [{ event_type: 'production_path', path_id: 'mass_distillation_campaign', observed_at: '2026-10-07T15:26:56Z', evidence: {
      curriculum: { supply: { subjects: [] } }, curriculumReplenishment: { ok: false, error: 'rights_cleared_distillation_adapters_unavailable' },
    } }],
  })), now: new Date('2026-10-07T15:30:00Z') })
  assert.equal(failed.packaging.replenishment, 'error:rights_cleared_distillation_adapters_unavailable')
  const receiptWith = async (replenishment: Record<string, unknown>) => (await readComputerSciencePath({ db: readOnlyDb(fakeDb({
    cos_university_learning_assurance_events: [{ event_type: 'production_path', path_id: 'mass_distillation_campaign', observed_at: '2026-10-07T15:26:56Z', evidence: {
      curriculum: { supply: { subjects: [] } }, curriculumReplenishment: replenishment,
    } }],
  })), now: new Date('2026-10-07T15:30:00Z') })).packaging.replenishment
  // An empty recorded map means no source failed; a receipt without the field (full-buffer remediation) is unknown.
  assert.match(String(await receiptWith({ ok: true, skipped: false, targets: [CS], accepted: 1, sourceErrors: {} })), /sourceErrors=none$/)
  assert.match(String(await receiptWith({ ok: true, skipped: false, failureDerivedInserted: 3 })), /sourceErrors=n\/a$/)
})

test('a packaging pass without Computer Science in its supply is reported as zero batchable items', async () => {
  const path = await readComputerSciencePath({ db: readOnlyDb(fakeDb({
    cos_university_learning_assurance_events: [{ event_type: 'production_path', path_id: 'mass_distillation_campaign', observed_at: '2026-10-06T19:05:00Z', evidence: { curriculum: { supply: { subjects: [{ subject: 'Mathematics', canonicalSubjectId: 'mathematics', uniqueBatchableItems: 400, shortfallToBatch: 0 }] } } } }],
  })), now: new Date('2026-10-06T21:30:00Z') })
  assert.equal(path.packaging.supplyItems, null)
  assert.equal(path.packaging.supplyShortfall, 64)
  assert.match(describeComputerSciencePath(path), /supply=absent from supply \(0 batchable items; needs 64\)/)
})

test('the report route prints the path without letting it hide the Step 1 report', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-step1-evidence/route.ts', import.meta.url), 'utf8')
  assert.match(route, /readComputerSciencePath\(\{ db: readOnlyDb\(service\), now \}\)/)
  assert.match(route, /COMPUTER SCIENCE PATH unavailable/)
  const workflow = readFileSync(new URL('../../.github/workflows/assembly-line-live-proof.yml', import.meta.url), 'utf8')
  assert.match(workflow, /## Computer Science path \(now\)/)
  assert.match(workflow, /\.computerSciencePathSummary/)
})
// end of saas/tests/cosUniversityComputerSciencePath.node.test.ts (if this line is missing, the paste was cut short)
