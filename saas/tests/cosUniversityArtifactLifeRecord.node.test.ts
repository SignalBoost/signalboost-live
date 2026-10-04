// saas/tests/cosUniversityArtifactLifeRecord.node.test.ts
//
// The VIN lookup: one artifact's whole life, read by permanent ID, from the tables that already hold it.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  LIFE_RECORD_EVENT_LIMIT,
  LIFE_RECORD_SCHEMA_VERSION,
  classifyLookup,
  describeArtifactLife,
  readArtifactLifeRecord,
} from '../lib/ai/cos/cosUniversityArtifactLifeRecord.ts'
import { COS_UNIVERSITY_LIFE_RECORD_COPY } from '../lib/i18n/cosUniversityLifeRecordCopy.ts'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

const AI_ID = '3f2b9c1e-7a4d-4e5f-8b6a-1c2d3e4f5a6b'
const HASH = 'a'.repeat(64)
const CAND = 'mass:8f5af666'

/** A PostgREST-shaped store over in-memory tables. Records every select so the test can prove what was never read. */
function fakeDb(tables: Record<string, any[]>, failing: Set<string> = new Set()) {
  const selects: Array<{ table: string; columns: string }> = []
  const db = {
    from(table: string) {
      const filters: Array<(row: any) => boolean> = []
      let columns = '*'
      let order: { column: string; ascending: boolean } | null = null
      let limit = Infinity
      const run = () => {
        if (failing.has(table)) return { data: null, error: new Error(`${table}_unreadable`) }
        let rows = (tables[table] || []).filter(row => filters.every(f => f(row)))
        if (order) rows = [...rows].sort((a, b) => String(a[order!.column] ?? '').localeCompare(String(b[order!.column] ?? '')) * (order!.ascending ? 1 : -1))
        return { data: rows.slice(0, limit), error: null }
      }
      const q: any = {
        select(c: string) { columns = c; selects.push({ table, columns: c }); return q },
        eq(column: string, value: unknown) { filters.push(row => String(row[column]) === String(value)); return q },
        order(column: string, options: { ascending: boolean }) { order = { column, ascending: options.ascending }; return q },
        limit(n: number) { limit = n; return q },
        maybeSingle() { const r = run(); return Promise.resolve(r.error ? r : { data: r.data?.[0] ?? null, error: null }) },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) { return Promise.resolve(run()).then(resolve, reject) },
      }
      void columns
      return q
    },
  }
  return { db, selects }
}

const fullLife = () => ({
  cos_local_distillation_artifacts: [{ id: 'row1', permanent_artifact_id: AI_ID, candidate_id: CAND, subject_id: 'computer_science_coding', trained_artifact_hash: HASH, artifact_kind: 'mass_distilled', status: 'active', runtime_target: 'runpod_serverless', intended_use: 'coder', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-03T10:00:00Z' }],
  cos_university_artifact_birth_certificates: [
    { permanent_artifact_id: AI_ID, candidate_id: CAND, trained_artifact_hash: HASH, issuance_kind: 'native_birth', born_at: '2026-10-01T09:59:00Z', issued_at: '2026-10-01T10:00:00Z', creator: 'itmounts', issuing_system: 'cos_university', student_model_id: 'Qwen/Qwen3-4B', teacher_model_id: 'Qwen/Qwen3-8B', training_evidence_ref: 'hf://run/1', revision_key: 'b'.repeat(64), dataset_hash: 'c'.repeat(64), parent_permanent_artifact_id: null },
    { permanent_artifact_id: '11111111-2222-4333-8444-555555555555', candidate_id: 'mass:child', trained_artifact_hash: 'd'.repeat(64), parent_permanent_artifact_id: AI_ID, issuance_kind: 'native_birth', born_at: '2026-10-02T00:00:00Z' },
  ],
  cos_university_mass_distillation_batch_runs: [{ id: 'run1', candidate_id: CAND, campaign_id: 'camp1', batch_key: 'bk1', stage: 'complete', source_count: 12, teacher_model_id: 'Qwen/Qwen3-8B', teacher_model_revision: 'rev8b', student_model_revision: 'rev4b', prompt_set_hash: 'e'.repeat(64), teacher_output_hashes: ['h1', 'h2', 'h3'], dataset_hash: 'c'.repeat(64), training_manifest_hash: null, holdout_manifest_hash: 'f'.repeat(64), failure_reason: null, completed_at: '2026-10-01T09:50:00Z', created_at: '2026-10-01T09:00:00Z', trained_artifact_hash: HASH }],
  cos_university_mass_hosted_teacher_rows: [
    { candidate_id: CAND, provider: 'huggingface', model: 'Qwen/Qwen3-8B', prompt_id: 'p1', response_text: 'SECRET TEACHER TEXT' },
    { candidate_id: CAND, provider: 'huggingface', model: 'Qwen/Qwen3-8B', prompt_id: 'p2', response_text: 'SECRET TEACHER TEXT' },
    { candidate_id: CAND, provider: 'openai', model: 'gpt', prompt_id: 'p1', response_text: 'SECRET TEACHER TEXT' },
  ],
  cos_university_distilled_evaluation_runs: [
    { run_key: 'r1', candidate_id: CAND, trained_artifact_hash: HASH, created_at: '2026-10-02T01:00:00Z', evaluator_id: 'itmounts-independent:qwen', evaluator_version: 'v9', holdout_case_count: 20, baseline_score: 0.4, trained_artifact_score: 0.65, safety_score: 0.9, safety_baseline_score: 0.85, transfer_baseline_score: 0.5, transfer_artifact_score: 0.6, retention_baseline_score: 0.5, retention_artifact_score: 0.55, holdout_improved: true, safety_passed: true, unseen_transfer_passed: true, delayed_retention_passed: true },
    { run_key: 'r0', candidate_id: CAND, trained_artifact_hash: HASH, created_at: '2026-10-01T20:00:00Z', evaluator_id: 'itmounts-independent:qwen', evaluator_version: 'v9', holdout_case_count: 20, baseline_score: 0.4, trained_artifact_score: 0.3, safety_score: 0.9, safety_baseline_score: 0.85, transfer_baseline_score: 0.5, transfer_artifact_score: 0.6, retention_baseline_score: 0.5, retention_artifact_score: 0.55, holdout_improved: false, safety_passed: true, unseen_transfer_passed: true, delayed_retention_passed: true },
  ],
  cos_university_learning_assurance_events: [
    { candidate_id: CAND, event_type: 'mass_evaluation', path_id: 'mass_distilled_independent_evaluation', verifier: 'v', observed_at: '2026-10-02T01:00:00Z', evidence: { status: 'passed' } },
    { candidate_id: CAND, event_type: 'mass_evaluation', path_id: 'mass_distilled_independent_evaluation', verifier: 'v', observed_at: '2026-10-01T20:00:00Z', evidence: { error: 'mass_distilled_evaluation_judge_zero_collapse:safety' } },
  ],
  cos_university_residency_enrollments: [{ id: 'res1', candidate_id: CAND, trained_artifact_hash: HASH, program_id: 'builder-residency', standing: 'residency_complete', admitted_at: '2026-10-02T02:00:00Z', completed_at: '2026-10-02T08:00:00Z', created_at: '2026-10-02T02:00:00Z' }],
  cos_university_residency_case_runs: [
    { residency_id: 'res1', harness_outcome: 'passed', competency_id: 'c1', failure_code: null, status: 'completed' },
    { residency_id: 'res1', harness_outcome: 'passed', competency_id: 'c2', failure_code: null, status: 'completed' },
    { residency_id: 'res1', harness_outcome: 'failed', competency_id: 'c3', failure_code: 'strict_rule', status: 'completed' },
    { residency_id: 'other', harness_outcome: 'passed', competency_id: 'c9', failure_code: null, status: 'completed' },
  ],
  cos_university_graduate_model_registry: [{ id: 'reg1', candidate_id: CAND, trained_artifact_hash: HASH, status: 'active', runtime_provider: 'runpod', runtime_model_id: 'exact', promoted_at: '2026-10-02T09:00:00Z', activated_at: '2026-10-02T09:30:00Z', quarantined_at: null, retired_at: null, promotion_evidence_hash: '1'.repeat(64), activation_evidence_hash: '2'.repeat(64), created_at: '2026-10-02T09:00:00Z' }],
  cos_workforce_roster: [{ candidate_id: CAND, trained_artifact_hash: HASH, specialty: 'Computer Science & Coding', job_roles: ['coder', 'critic'], status: 'on_call', hired_at: '2026-10-02T10:00:00Z', retired_at: null, retired_reason: null }],
  cos_university_graduate_lifecycle_events: [
    { candidate_id: CAND, trained_artifact_hash: HASH, event_type: 'graduated', observed_at: '2026-10-02T09:00:00Z', evidence_hash: '3'.repeat(64) },
    { candidate_id: CAND, trained_artifact_hash: HASH, event_type: 'activated', observed_at: '2026-10-02T09:30:00Z', evidence_hash: '4'.repeat(64) },
    { candidate_id: CAND, trained_artifact_hash: HASH, event_type: 'serving_succeeded', observed_at: '2026-10-03T10:00:00Z', evidence_hash: '5'.repeat(64) },
  ],
  cos_university_graduate_serving_attempts: [
    { candidate_id: CAND, trained_artifact_hash: HASH, phase: 'attempt_started', outcome: 'pending', worker_role: 'coder', error_class: null, recorded_at: '2026-10-03T09:59:00Z' },
    { candidate_id: CAND, trained_artifact_hash: HASH, phase: 'attempt_succeeded', outcome: 'success', worker_role: 'coder', error_class: null, recorded_at: '2026-10-03T10:00:00Z' },
    { candidate_id: CAND, trained_artifact_hash: HASH, phase: 'attempt_failed', outcome: 'timeout', worker_role: 'critic', error_class: 'cold_start', recorded_at: '2026-10-03T11:00:00Z' },
  ],
})

test('the lookup key is classified before any read: UUID, 64-hex hash, candidate id; anything else refused', () => {
  assert.deepEqual(classifyLookup(AI_ID.toUpperCase()), { kind: 'permanent_artifact_id', value: AI_ID })
  assert.deepEqual(classifyLookup(HASH.toUpperCase()), { kind: 'trained_artifact_hash', value: HASH })
  assert.deepEqual(classifyLookup(' mass:8f5af666 '), { kind: 'candidate_id', value: 'mass:8f5af666' })
  assert.equal(classifyLookup(''), null)
  assert.equal(classifyLookup('drop table;'), null)
  assert.equal(classifyLookup("x' or 1=1"), null)
})

test('a full life reads back chapter by chapter, every chapter naming its table, by permanent id, candidate id or hash', async () => {
  for (const key of [AI_ID, CAND, HASH]) {
    const { db, selects } = fakeDb(fullLife())
    const result = await readArtifactLifeRecord({ db, lookup: key, now: new Date('2026-10-04T00:00:00Z') })
    assert.equal(result.ok, true)
    if (!result.ok) return
    const r = result.record
    assert.equal(r.schemaVersion, LIFE_RECORD_SCHEMA_VERSION)
    assert.equal(r.identity.permanentArtifactId, AI_ID)
    assert.equal(r.identity.candidateId, CAND)
    assert.equal(r.identity.status, 'active')
    assert.ok(r.birth.available && r.birth.issued && r.birth.issuanceKind === 'native_birth' && r.birth.bornAt === '2026-10-01T09:59:00.000Z')
    assert.ok(r.birth.available && r.birth.children.length === 1 && r.birth.children[0] === '11111111-2222-4333-8444-555555555555')
    assert.ok(r.curriculum.available && r.curriculum.batchRun?.sourceCount === 12 && r.curriculum.batchRun?.teacherOutputCount === 3)
    assert.ok(r.curriculum.available && r.curriculum.teacherRows === 3 && r.curriculum.distinctPrompts === 2)
    assert.ok(r.curriculum.available && r.curriculum.teacherByProviderModel['huggingface:Qwen/Qwen3-8B'] === 2 && r.curriculum.teacherByProviderModel['openai:gpt'] === 1)
    assert.ok(r.examinations.available && r.examinations.total === 2 && r.examinations.passedAll === 1 && r.examinations.runs[0].runKey === 'r1')
    assert.ok(r.examinations.available && r.examinations.runs[0].holdout.artifact === 0.65 && r.examinations.runs[1].passedAll === false)
    assert.ok(r.universityHistory.available && r.universityHistory.total === 2 && r.universityHistory.failures['mass_distilled_evaluation_judge_zero_collapse:safety'] === 1)
    assert.ok(r.residency.available && r.residency.enrolled && r.residency.cases === 3 && r.residency.competenciesDemonstrated === 2 && r.residency.failureCodes.strict_rule === 1)
    assert.ok(r.graduation.available && r.graduation.registered && r.graduation.status === 'active' && r.graduation.promotedAt === '2026-10-02T09:00:00.000Z')
    assert.ok(r.employment.available && r.employment.hired && r.employment.jobRoles.join(',') === 'coder,critic' && r.employment.lifecycle.total === 3)
    assert.ok(r.work.available && r.work.attempts === 3 && r.work.byOutcome.success === 1 && r.work.errorClasses.cold_start === 1 && r.work.lastAt === '2026-10-03T11:00:00.000Z')
    assert.equal(r.departure.left, false)
    for (const chapter of ['identity', 'birth', 'curriculum', 'examinations', 'universityHistory', 'residency', 'graduation', 'employment', 'work', 'departure']) {
      assert.ok(r.sources[chapter], `${chapter} names its source`)
    }
    // Teacher text is never read: the only columns selected from the teacher rows table are provider, model and prompt id.
    const teacherSelects = selects.filter(s => s.table === 'cos_university_mass_hosted_teacher_rows')
    assert.ok(teacherSelects.length === 1 && teacherSelects[0].columns === 'provider,model,prompt_id')
    assert.ok(!JSON.stringify(r).includes('SECRET TEACHER TEXT'))
    assert.match(describeArtifactLife(r), new RegExp(`^ai_id=${AI_ID} status=active born=2026-10-01T09:59:00.000Z \\| 1/2 exams passed \\| graduated=2026-10-02T09:00:00.000Z \\| 3 serving attempts \\(1 success\\)$`))
  }
})

test('an artifact that left the University has a life record too, and says why it left', async () => {
  const tables = fullLife()
  tables.cos_local_distillation_artifacts[0].status = 'retired'
  tables.cos_university_learning_assurance_events.unshift({ candidate_id: CAND, event_type: 'quarantine_resolution', path_id: 'q', verifier: 'v', observed_at: '2026-10-03T12:00:00Z', evidence: { claim: 'university_student_dismissed' } })
  const result = await readArtifactLifeRecord({ db: fakeDb(tables).db, lookup: AI_ID })
  assert.ok(result.ok)
  if (!result.ok) return
  assert.deepEqual(result.record.departure, { left: true, status: 'retired', reason: 'university_student_dismissed', at: '2026-10-03T12:00:00.000Z' })
  assert.match(describeArtifactLife(result.record), /\| left=retired:university_student_dismissed$/)
})

test('a never-graduated artifact: born, examined, nothing else - chapters say so instead of inventing', async () => {
  const tables = fullLife()
  tables.cos_local_distillation_artifacts[0].status = 'evaluation_pending'
  for (const t of ['cos_university_residency_enrollments', 'cos_university_graduate_model_registry', 'cos_workforce_roster', 'cos_university_graduate_lifecycle_events', 'cos_university_graduate_serving_attempts']) (tables as any)[t] = []
  const result = await readArtifactLifeRecord({ db: fakeDb(tables).db, lookup: AI_ID })
  assert.ok(result.ok)
  if (!result.ok) return
  const r = result.record
  assert.ok(r.residency.available && r.residency.enrolled === false)
  assert.ok(r.graduation.available && r.graduation.registered === false)
  assert.ok(r.employment.available && r.employment.hired === false && r.employment.lifecycle.total === 0)
  assert.ok(r.work.available && r.work.attempts === 0)
  assert.match(describeArtifactLife(r), /\| not graduated \| 0 serving attempts \(0 success\)$/)
})

test('one unreadable table hides one chapter, not the life; the chapter names the error', async () => {
  const result = await readArtifactLifeRecord({ db: fakeDb(fullLife(), new Set(['cos_university_distilled_evaluation_runs'])).db, lookup: AI_ID })
  assert.ok(result.ok)
  if (!result.ok) return
  assert.deepEqual(result.record.examinations, { available: false, error: 'cos_university_distilled_evaluation_runs_unreadable' })
  assert.ok(result.record.birth.available && result.record.work.available)
  assert.match(describeArtifactLife(result.record), /exams unavailable/)
})

test('unknown key, bad key and an unreadable artifact table are three different answers', async () => {
  assert.deepEqual(await readArtifactLifeRecord({ db: fakeDb(fullLife()).db, lookup: 'not a key!' }), { ok: false, error: 'lookup_key_invalid' })
  assert.deepEqual(await readArtifactLifeRecord({ db: fakeDb(fullLife()).db, lookup: 'mass:nobody' }), { ok: false, error: 'artifact_not_found' })
  const failed = await readArtifactLifeRecord({ db: fakeDb(fullLife(), new Set(['cos_local_distillation_artifacts'])).db, lookup: AI_ID })
  assert.equal(failed.ok, false)
  if (!failed.ok) assert.equal(failed.error, 'artifact_read_failed')
})

test('the history chapter is bounded and the record never carries prompts, answers or secrets', () => {
  const source = read('../lib/ai/cos/cosUniversityArtifactLifeRecord.ts')
  assert.equal(LIFE_RECORD_EVENT_LIMIT, 40)
  assert.match(source, /\.limit\(LIFE_RECORD_EVENT_LIMIT\)/)
  const code = source.split('\n').filter(line => !line.trim().startsWith('//')).join('\n')
  assert.doesNotMatch(code, /response_text|prompt_text|system_prompt|api_key|Authorization/)
  // Pure module: the store is injected; no database client, no network, no environment reads.
  assert.doesNotMatch(source, /^import /m)
  assert.doesNotMatch(source, /process\.env|fetch\(/)
})

test('the API is owner-gated and read-only; the panel is mounted on the telemetry page beside the settings', () => {
  const api = read('../app/api/admin/cos-university-artifact-life/route.ts')
  assert.match(api, /export async function GET\(req: NextRequest\)[\s\S]{0,80}?await requireOwner\(\)/)
  assert.doesNotMatch(api, /export async function (POST|PATCH|PUT|DELETE)/)
  assert.match(api, /readArtifactLifeRecord\(\{ db: getAdminSupabase\(\), lookup: id \}\)/)
  assert.match(api, /result\.ok === false[\s\S]{0,120}?'lookup_key_invalid' \? 400 : result\.error === 'artifact_not_found' \? 404 : 500/)
  const page = read('../app/dashboard/cos-university-telemetry/page.tsx')
  assert.match(page, /import ArtifactLifeRecordPanel from '\.\/ArtifactLifeRecordPanel\.tsx'/)
  assert.match(page, /<ArtifactLifeRecordPanel copy=\{lifeRecordCopy\} \/>/)
  assert.ok(page.indexOf('<UniversitySettingsPanel') < page.indexOf('<ArtifactLifeRecordPanel'), 'the life record sits in the settings/reports group, after the settings')
  const panel = read('../app/dashboard/cos-university-telemetry/ArtifactLifeRecordPanel.tsx')
  assert.match(panel, /const LIFE_URL = '\/api\/admin\/cos-university-artifact-life'/)
  assert.doesNotMatch(panel, /method: '(POST|PATCH|PUT|DELETE)'/)
  assert.doesNotMatch(panel, />[A-Z][a-z]+ [a-z]+</, 'every visible string comes from copy')
})

test('the life record copy has the same keys in all five languages and no empty string', () => {
  const languages = Object.keys(COS_UNIVERSITY_LIFE_RECORD_COPY).sort()
  assert.deepEqual(languages, ['en', 'es', 'pl', 'pt', 'ru'])
  const keys = Object.keys(COS_UNIVERSITY_LIFE_RECORD_COPY.en)
  for (const language of languages) {
    const block = COS_UNIVERSITY_LIFE_RECORD_COPY[language as keyof typeof COS_UNIVERSITY_LIFE_RECORD_COPY]
    assert.deepEqual(Object.keys(block), keys, language)
    for (const key of keys) assert.ok(String((block as any)[key]).trim().length > 0, `${language}.${key}`)
  }
})
// end of saas/tests/cosUniversityArtifactLifeRecord.node.test.ts (if this line is missing, the paste was cut short)
