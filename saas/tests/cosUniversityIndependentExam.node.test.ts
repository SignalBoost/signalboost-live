import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { COS_UNIVERSITY_SUBJECTS } from '../lib/ai/cos/cosUniversity.ts'
import { academicStateFromRows, type CosUniversityAssessmentRow } from '../lib/ai/cos/cosUniversityAcademicState.ts'
import {
  COS_UNIVERSITY_EXAM_PROFILE,
  COS_UNIVERSITY_EXAM_SCORER,
  buildCosUniversityBlindExam,
  scoreCosUniversityBlindExam,
  selectCosUniversityExamTargets,
  universityExamValidityDays,
  type CosUniversityExamAssessmentRow,
  type CosUniversityExamTarget,
} from '../lib/ai/cos/cosUniversityIndependentExam.ts'

const file = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')
const provenance = { localReasoning: true, externalAi: false, semanticCache: false, handled: true, turnId: '11111111-1111-4111-8111-111111111111' }

function examRow(target: CosUniversityExamTarget, key: string): CosUniversityExamAssessmentRow {
  return {
    subject_id: target.kind === 'subject' ? target.subjectId : null,
    language_code: target.kind === 'language' ? target.language : null,
    language_dimension: target.kind === 'language' ? target.dimension : null,
    assessment_kind: 'unseen_subject_exam',
    passed: true,
    independent_scorer: true,
    scorer_authority: 'host_private_exam',
    observed_at: `2026-09-0${key}T12:00:00.000Z`,
    valid_until: '2027-09-30T12:00:00.000Z',
  }
}

function academicRow(key: string): CosUniversityAssessmentRow {
  return {
    assessment_key: `math-${key}`,
    subject_id: 'mathematics',
    language_code: null,
    language_dimension: null,
    assessment_kind: 'unseen_subject_exam',
    passed: true,
    independent_scorer: true,
    scorer_version: COS_UNIVERSITY_EXAM_SCORER,
    scorer_authority: 'host_private_exam',
    observed_at: `2026-09-0${key}T12:00:00.000Z`,
    valid_until: '2027-09-30T12:00:00.000Z',
  }
}

test('every undergraduate subject has a deterministic server-seeded unseen exam', () => {
  const seed = '12345678-1234-4234-8234-123456789abc'
  const exams = COS_UNIVERSITY_SUBJECTS.map(subject => buildCosUniversityBlindExam(seed, { kind: 'subject', subjectId: subject.id }))
  assert.equal(exams.length, 13)
  assert.ok(exams.every(exam => exam.profile === COS_UNIVERSITY_EXAM_PROFILE))
  assert.ok(exams.every(exam => exam.scorerVersion === COS_UNIVERSITY_EXAM_SCORER))
  assert.ok(exams.every(exam => exam.assessmentKind === 'unseen_subject_exam'))
  assert.ok(exams.every(exam => exam.prompt.length > 80))
  assert.equal(new Set(exams.map(exam => exam.caseId)).size, 13)
  assert.equal(new Set(exams.map(exam => exam.manifestHash)).size, 13)
})

test('fresh seeds alter hidden exam manifests instead of recycling one fixture', () => {
  const a = buildCosUniversityBlindExam('12345678-1234-4234-8234-123456789abc', { kind: 'subject', subjectId: 'mathematics' })
  const b = buildCosUniversityBlindExam('abcdefab-cdef-4abc-8def-abcdefabcdef', { kind: 'subject', subjectId: 'mathematics' })
  assert.notEqual(a.caseId, b.caseId)
  assert.notEqual(a.manifestHash, b.manifestHash)
  assert.notEqual(a.prompt, b.prompt)
})

test('host scorer accepts a correct bounded math solution and rejects a wrong one', () => {
  const exam = buildCosUniversityBlindExam('12345678-1234-4234-8234-123456789abc', { kind: 'subject', subjectId: 'mathematics' })
  const match = exam.prompt.match(/x \+ y = (\d+); 2x - y = (-?\d+)/)
  assert.ok(match)
  const a = Number(match![1])
  const b = Number(match![2])
  const x = (a + b) / 3
  const y = a - x
  const correct = `x = ${x}; y = ${y}. Verification by substitution: ${x} + ${y} = ${a}, and 2(${x}) - ${y} = ${b}.`
  assert.equal(scoreCosUniversityBlindExam(exam, correct, provenance).passed, true)
  const wrong = `x = ${x + 1}; y = ${y}. Verification by substitution.`
  assert.equal(scoreCosUniversityBlindExam(exam, wrong, provenance).passed, false)
})

test('a semantically good answer cannot pass without fresh local provenance', () => {
  const exam = buildCosUniversityBlindExam('12345678-1234-4234-8234-123456789abc', { kind: 'subject', subjectId: 'reasoning_decision_science' })
  const reply = 'The conclusion does not follow; it is invalid. Counterexample: red widgets could all be heavy but non-fragile while different heavy widgets are fragile. An additional premise would need to connect red widgets with fragile widgets.'
  assert.equal(scoreCosUniversityBlindExam(exam, reply, provenance).passed, true)
  const external = scoreCosUniversityBlindExam(exam, reply, { ...provenance, externalAi: true })
  assert.equal(external.passed, false)
  assert.ok(external.reasons.includes('external_ai_used'))
  const cached = scoreCosUniversityBlindExam(exam, reply, { ...provenance, semanticCache: true })
  assert.equal(cached.passed, false)
  assert.ok(cached.reasons.includes('semantic_cache_used'))
})

test('language examinations are independent by language and communication dimension', () => {
  const exam = buildCosUniversityBlindExam('12345678-1234-4234-8234-123456789abc', { kind: 'language', language: 'pl', dimension: 'comprehension' })
  const reply = 'Projekt Orion przeszedł 3 kontrole 14 września. Status wdrożenia pozostaje nieznany.'
  assert.equal(scoreCosUniversityBlindExam(exam, reply, provenance).passed, true)
  assert.equal(exam.target.kind, 'language')
  if (exam.target.kind === 'language') {
    assert.equal(exam.target.language, 'pl')
    assert.equal(exam.target.dimension, 'comprehension')
  }
})

test('exam selection always reserves one subject and one language-dimension lane', () => {
  const now = new Date('2026-09-08T00:00:00.000Z')
  const first = selectCosUniversityExamTargets([], now)
  assert.equal(first[0].kind, 'subject')
  assert.equal(first[1].kind, 'language')

  const rows = [examRow(first[0], '1'), examRow(first[0], '2'), examRow(first[1], '1'), examRow(first[1], '2')]
  const next = selectCosUniversityExamTargets(rows, now)
  assert.notDeepEqual(next[0], first[0])
  assert.notDeepEqual(next[1], first[1])
})

test('durable transcript requires two fresh independent unseen passes before B', () => {
  const now = new Date('2026-09-08T00:00:00.000Z')
  const one = academicStateFromRows([academicRow('1')], now)
  assert.equal(one.subjectTranscript.find(row => row.subjectId === 'mathematics')?.grade, 'D')
  assert.match(one.subjectTranscript.find(row => row.subjectId === 'mathematics')?.reasons.join(' ') || '', /two|2/i)

  const two = academicStateFromRows([academicRow('1'), academicRow('2')], now)
  assert.equal(two.subjectTranscript.find(row => row.subjectId === 'mathematics')?.grade, 'B')
})

test('recertification windows decay faster for current technical/governance domains than slow fundamentals', () => {
  assert.equal(universityExamValidityDays({ kind: 'subject', subjectId: 'cybersecurity' }), 90)
  assert.equal(universityExamValidityDays({ kind: 'subject', subjectId: 'mathematics' }), 365)
  assert.equal(universityExamValidityDays({ kind: 'language', language: 'pl', dimension: 'writing' }), 120)
})

test('exam ledger is service-only and stores neither hidden rubric nor raw prompt/reply', () => {
  const migration = file('../supabase/migrations/20260908010500_cos_university_independent_exams.sql')
  assert.match(migration, /create table if not exists public\.cos_university_exam_runs/i)
  assert.match(migration, /alter table public\.cos_university_exam_runs enable row level security/i)
  assert.match(migration, /revoke all on public\.cos_university_exam_runs from anon, authenticated/i)
  assert.match(migration, /grant select, insert, update, delete on public\.cos_university_exam_runs to service_role/i)
  const schema = migration.split('create table if not exists public.cos_university_exam_runs')[1] || ''
  assert.doesNotMatch(schema, /\bprompt\s+text\b/i)
  assert.doesNotMatch(schema, /\breply\s+text\b/i)
  assert.doesNotMatch(schema, /\brubric\s+jsonb\b/i)
  assert.doesNotMatch(schema, /\bgrade\s+text\b/i)
})

test('runtime keeps examiner authority separate from learner and feeds failures back into remediation', () => {
  const runner = file('../lib/ai/cos/cosUniversityIndependentExamRunner.ts')
  assert.match(runner, /disableCache: true/)
  assert.match(runner, /localModelInvoked/)
  assert.match(runner, /externalAiInvoked/)
  assert.match(runner, /scoreCosUniversityBlindExam/)
  assert.match(runner, /scorerAuthority: 'host_private_exam'/)
  assert.match(runner, /attachTurnOutcome/)
  assert.match(runner, /source: `cos_university_exam:/)
  assert.doesNotMatch(runner, /\bgrade\s*:/)
})

test('cron is secret-gated, scheduled after study, and never returns prompt, reply, or rubric', () => {
  const route = file('../app/api/cron/cos-university-exam/route.ts')
  const vercel = file('../vercel.json')
  assert.match(route, /auth !== `Bearer \$\{secret\}`/)
  assert.match(route, /runCosUniversityIndependentExamBatch\(\{ maxExams: 2 \}\)/)
  assert.doesNotMatch(route, /prompt:/)
  assert.doesNotMatch(route, /reply:/)
  assert.doesNotMatch(route, /rubric:/)
  assert.match(vercel, /"COS_UNIVERSITY_EXAMS_ENABLED": "true"/)
  assert.match(vercel, /"\/api\/cron\/cos-university-exam", "schedule": "0 7 \* \* \*"/)
})


test('infrastructure-error exams receive one fresh identity without reopening academic failures', () => {
  const runner = file('../lib/ai/cos/cosUniversityIndependentExamRunner.ts')
  assert.match(runner, /existing\?\.status === 'error'/)
  assert.match(runner, /reason\.startsWith\('execution_error:'\)/)
  assert.match(runner, /infrastructure-retry:\$\{existing\.id\}/)
  assert.match(runner, /if \(existing && !retryableInfrastructureError\) return existing/)
  assert.match(runner, /if \(retryExisting\) return retryExisting/)
})
