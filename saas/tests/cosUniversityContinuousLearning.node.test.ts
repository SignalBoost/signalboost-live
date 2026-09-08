import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  detectPlatformLanguages,
  rotatingPlatformLanguageTarget,
  rotatingUniversitySubjectTarget,
  selectCosUniversityStudyStrategy,
  universityStudyGapSignal,
} from '../lib/ai/cos/cosUniversityStudyStrategy.ts'
import { academicStateFromRows } from '../lib/ai/cos/cosUniversityAcademicState.ts'
import { buildCosUniversityTranscript } from '../lib/ai/cos/cosUniversity.ts'
import { buildCosPlatformLanguageTranscript } from '../lib/ai/cos/cosUniversityLanguages.ts'

const file = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

test('study method varies by failure class instead of defaulting every weakness to generic RAG', () => {
  const stale = selectCosUniversityStudyStrategy({ failureClass: 'stale_or_missing_knowledge' })
  assert.equal(stale.methods[0]?.id, 'live_authoritative_research')
  assert.ok(stale.acquisitionSourceKinds.includes('news_article'))
  assert.ok(stale.acquisitionSourceKinds.includes('official_documentation'))

  const execution = selectCosUniversityStudyStrategy({ failureClass: 'tool_execution' })
  assert.equal(execution.methods[0]?.id, 'sandbox_lab')
  assert.ok(execution.methods.some(method => method.id === 'production_replay'))
  assert.deepEqual(execution.acquisitionSourceKinds, ['official_documentation', 'library_material'])

  const reasoning = selectCosUniversityStudyStrategy({ failureClass: 'reasoning' })
  assert.equal(reasoning.methods[0]?.id, 'teacher_agent')
  assert.ok(reasoning.methods.some(method => method.id === 'peer_agent_a2a' && method.execution === 'requires_bridge'))
  assert.ok(reasoning.methods.some(method => method.id === 'deliberate_practice'))
})

test('fine-tuning is only a candidate after repeated independently verified failure and never auto-executes', () => {
  const normal = selectCosUniversityStudyStrategy({
    failureClass: 'reasoning', repeatedFailures: 4, independentRetestFailures: 1,
  })
  assert.equal(normal.fineTuneCandidate, false)
  assert.equal(normal.methods.some(method => method.id === 'fine_tune_candidate'), false)

  const repeated = selectCosUniversityStudyStrategy({
    failureClass: 'reasoning', repeatedFailures: 4, independentRetestFailures: 2,
  })
  assert.equal(repeated.fineTuneCandidate, true)
  const fineTune = repeated.methods.find(method => method.id === 'fine_tune_candidate')
  assert.equal(fineTune?.execution, 'candidate_only')
})

test('five platform languages are detectable as independent study targets', () => {
  assert.deepEqual(detectPlatformLanguages('Polish localization and Russian cultural pragmatics'), ['pl', 'ru'])
  assert.deepEqual(detectPlatformLanguages('Improve Portuguese writing'), ['pt'])
})

test('continuous education rotates under-target subjects and languages instead of starving on the first unassessed item', () => {
  const subjects = buildCosUniversityTranscript([])
  const languages = buildCosPlatformLanguageTranscript([])
  assert.notEqual(rotatingUniversitySubjectTarget(subjects, 0)?.subjectId, rotatingUniversitySubjectTarget(subjects, 1)?.subjectId)
  assert.notEqual(rotatingPlatformLanguageTarget(languages, 0)?.language, rotatingPlatformLanguageTarget(languages, 1)?.language)
})

test('academic state ignores self-scored and expired evidence rather than turning study activity into grades', () => {
  const now = new Date('2026-09-07T20:00:00Z')
  const state = academicStateFromRows([
    {
      assessment_key: 'self-scored', subject_id: 'computer_science', language_code: null, language_dimension: null,
      assessment_kind: 'unseen_subject_exam', passed: true, independent_scorer: false,
      scorer_version: 'learner-v1', scorer_authority: 'host_private_exam',
      observed_at: '2026-09-07T18:00:00Z', valid_until: '2026-10-07T18:00:00Z',
    },
    {
      assessment_key: 'expired', subject_id: 'mathematics', language_code: null, language_dimension: null,
      assessment_kind: 'unseen_subject_exam', passed: true, independent_scorer: true,
      scorer_version: 'host-v1', scorer_authority: 'host_private_exam',
      observed_at: '2026-07-01T00:00:00Z', valid_until: '2026-08-01T00:00:00Z',
    },
  ], now)
  assert.equal(state.subjectTranscript.find(row => row.subjectId === 'computer_science')?.grade, 'unassessed')
  assert.equal(state.subjectTranscript.find(row => row.subjectId === 'mathematics')?.grade, 'unassessed')
})

test('host-controlled transcript requires repeated fresh unseen evidence rather than one lucky exam', () => {
  const state = academicStateFromRows([
    {
      assessment_key: 'math-practice', subject_id: 'mathematics', language_code: null, language_dimension: null,
      assessment_kind: 'practice_checkpoint', passed: true, independent_scorer: true,
      scorer_version: 'host-v1', scorer_authority: 'host_private_exam',
      observed_at: '2026-09-07T17:00:00Z', valid_until: '2026-10-07T17:00:00Z',
    },
    {
      assessment_key: 'math-exam-1', subject_id: 'mathematics', language_code: null, language_dimension: null,
      assessment_kind: 'unseen_subject_exam', passed: true, independent_scorer: true,
      scorer_version: 'host-v1', scorer_authority: 'host_private_exam',
      observed_at: '2026-09-07T18:00:00Z', valid_until: '2026-10-07T18:00:00Z',
    },
    {
      assessment_key: 'math-exam-2', subject_id: 'mathematics', language_code: null, language_dimension: null,
      assessment_kind: 'unseen_subject_exam', passed: true, independent_scorer: true,
      scorer_version: 'host-v1', scorer_authority: 'host_private_exam',
      observed_at: '2026-09-07T19:00:00Z', valid_until: '2026-10-07T19:00:00Z',
    },
  ], new Date('2026-09-07T20:00:00Z'))
  assert.equal(state.subjectTranscript.find(row => row.subjectId === 'mathematics')?.grade, 'B')
})

test('University gap signal carries the strategist source restriction', () => {
  const strategy = selectCosUniversityStudyStrategy({ failureClass: 'tool_execution' })
  const signal = universityStudyGapSignal({
    planKey: 'tool-plan',
    subjectId: 'computer_science',
    objective: 'Improve governed tool execution on unseen software tasks.',
    failureClass: 'tool_execution',
    strategy,
  })
  assert.deepEqual(signal.sourceKinds, ['official_documentation', 'library_material'])
})

test('gap generation and learning cycle preserve and enforce method-specific source classes', () => {
  const gaps = file('../lib/cos-core/layers/learning/gaps.ts')
  const cycle = file('../lib/cos-core/layers/learning/cycle.ts')
  assert.match(gaps, /sourceKinds: signal\.sourceKinds\?\.length \? \[\.\.\.new Set\(signal\.sourceKinds\)\] : undefined/)
  assert.match(cycle, /export function learningAdapterAllowedForGap/)
  assert.match(cycle, /return !allowed\.length\|\|allowed\.includes\(adapter\.kind\)/)
  assert.match(cycle, /if\(learningAdapterAllowedForGap\(gap,adapter\)\) tasks\.push/)
})

test('migration separates service-only academic evidence from remediation plans', () => {
  const migration = file('../supabase/migrations/20260908002000_cos_university_continuous_learning.sql')
  assert.match(migration, /create table if not exists public\.cos_university_assessments/i)
  assert.match(migration, /create table if not exists public\.cos_university_study_plans/i)
  assert.match(migration, /alter table public\.cos_university_assessments enable row level security/i)
  assert.match(migration, /alter table public\.cos_university_study_plans enable row level security/i)
  assert.match(migration, /revoke all on public\.cos_university_assessments from anon, authenticated/i)
  assert.match(migration, /revoke all on public\.cos_university_study_plans from anon, authenticated/i)
  assert.match(migration, /fine_tune_candidate boolean not null default false/i)
  const assessmentTable = migration.split('create table if not exists public.cos_university_assessments')[1]
    ?.split('create table if not exists public.cos_university_study_plans')[0] || ''
  assert.doesNotMatch(assessmentTable, /\bgrade\s+text\b/i)
})

test('daily cron plans education before acquisition and does not route study plans into grade writes', () => {
  const cron = file('../app/api/cron/cos-mining/route.ts')
  const store = file('../lib/ai/cos/cosUniversityStore.ts')
  const planCall = cron.indexOf('university = await runCosUniversityPlanningCycle()')
  const learningCall = cron.indexOf('learning = await runDailyAutonomousLearning')
  assert.ok(planCall > 0)
  assert.ok(learningCall > planCall)
  assert.match(cron, /injectedGapSignals: operationalSystemsCurriculumSignals\(\)\.concat\(university\?\.gapSignals \|\| \[\]\)/)
  assert.match(store, /This planner is model-free and does not award grades/)
  const planningBody = store.split('export async function runCosUniversityPlanningCycle')[1] || ''
  assert.doesNotMatch(planningBody, /recordCosUniversityAssessment\(/)
})
