import './cosUniversityPrograms.node.test.ts'
import './cosUniversityMasters.node.test.ts'
import './cosUniversityMastersRuntime.node.test.ts'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  COS_UNIVERSITY_SUBJECTS,
  type CosUniversityGrade,
  type CosUniversityTranscriptEntry,
} from '../lib/ai/cos/cosUniversity.ts'
import {
  COS_PLATFORM_LANGUAGES,
  type CosPlatformLanguageTranscriptEntry,
} from '../lib/ai/cos/cosUniversityLanguages.ts'
import type { CosUniversityAcademicState } from '../lib/ai/cos/cosUniversityAcademicState.ts'
import {
  COS_UNIVERSITY_GENERALIST_CAPSTONE_MINIMUM_DISTINCT_PASSES,
  buildCosUniversityGeneralistCapstoneExam,
  deriveCosUniversityGeneralistGraduation,
  generalistCapstonePassesSinceLatestFailure,
  generalistCapstoneThresholdMet,
  scoreCosUniversityGeneralistCapstoneExam,
  type CosUniversityGeneralistCapstoneRunEvidence,
} from '../lib/ai/cos/cosUniversityGraduation.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

function subjects(grade: CosUniversityGrade = 'A'): CosUniversityTranscriptEntry[] {
  return COS_UNIVERSITY_SUBJECTS.map(subject => ({
    subjectId: subject.id,
    title: subject.title,
    grade,
    evidenceCount: 8,
    latestAssessmentAt: '2026-09-08T00:00:00.000Z',
    reasons: ['fixture'],
  }))
}

function languages(grade: CosUniversityGrade = 'A'): CosPlatformLanguageTranscriptEntry[] {
  return COS_PLATFORM_LANGUAGES.map(language => ({
    language: language.id,
    title: language.title,
    grade,
    evidenceCount: 40,
    dimensionsPassed: [...language.competencyDimensions],
    latestAssessmentAt: '2026-09-08T00:00:00.000Z',
    reasons: ['fixture'],
  }))
}

function academicState(args: {
  subjectTranscript?: CosUniversityTranscriptEntry[]
  languageTranscript?: CosPlatformLanguageTranscriptEntry[]
} = {}): CosUniversityAcademicState {
  return {
    subjectTranscript: args.subjectTranscript ?? subjects(),
    languageTranscript: args.languageTranscript ?? languages(),
    assessmentRows: 100,
    semantics: 'fresh_independent_assessment_evidence_only',
  }
}

const twoPasses: CosUniversityGeneralistCapstoneRunEvidence[] = [
  { passed: true, variantHash: 'variant-a', observedAt: '2026-09-08T00:00:00Z' },
  { passed: true, variantHash: 'variant-b', observedAt: '2026-09-09T00:00:00Z' },
]

test('generalist graduation requires every canonical subject at A or higher', () => {
  const transcript = subjects()
  transcript[3] = { ...transcript[3], grade: 'A-' }
  const status = deriveCosUniversityGeneralistGraduation({
    academicState: academicState({ subjectTranscript: transcript }),
    capstoneRuns: twoPasses,
  })
  assert.equal(status.graduated, false)
  assert.equal(status.prerequisitesReady, false)
  assert.equal(status.subjectBlockers.length, 1)
  assert.equal(status.subjectBlockers[0].id, COS_UNIVERSITY_SUBJECTS[3].id)
  assert.equal(status.advancedLearningEligible, false)
})

test('missing subject evidence blocks graduation rather than averaging around it', () => {
  const status = deriveCosUniversityGeneralistGraduation({
    academicState: academicState({ subjectTranscript: subjects().slice(0, -1) }),
    capstoneRuns: twoPasses,
  })
  assert.equal(status.graduated, false)
  assert.equal(status.subjectBlockers.at(-1)?.grade, 'missing')
})

test('all five platform languages must independently meet A; one weak language blocks graduation', () => {
  const transcript = languages()
  transcript[4] = { ...transcript[4], grade: 'A-' }
  const status = deriveCosUniversityGeneralistGraduation({
    academicState: academicState({ languageTranscript: transcript }),
    capstoneRuns: twoPasses,
  })
  assert.equal(status.graduated, false)
  assert.equal(status.languageBlockers.length, 1)
  assert.equal(status.languageBlockers[0].id, 'ru')
})

test('two distinct generalist capstone passes are required and a later failure revokes the capstone', () => {
  assert.equal(COS_UNIVERSITY_GENERALIST_CAPSTONE_MINIMUM_DISTINCT_PASSES, 2)
  const rows: CosUniversityGeneralistCapstoneRunEvidence[] = [
    { passed: true, variantHash: 'same', observedAt: '2026-09-01T00:00:00Z' },
    { passed: true, variantHash: 'same', observedAt: '2026-09-02T00:00:00Z' },
  ]
  assert.equal(generalistCapstonePassesSinceLatestFailure(rows), 1)
  assert.equal(generalistCapstoneThresholdMet(rows), false)
  rows.push({ passed: true, variantHash: 'different', observedAt: '2026-09-03T00:00:00Z' })
  assert.equal(generalistCapstoneThresholdMet(rows), true)
  rows.push({ passed: false, variantHash: 'failure', observedAt: '2026-09-04T00:00:00Z' })
  assert.equal(generalistCapstonePassesSinceLatestFailure(rows), 0)
  assert.equal(generalistCapstoneThresholdMet(rows), false)
})

test('A generalist graduation is qualification for harder learning, not authority or the end of learning', () => {
  const status = deriveCosUniversityGeneralistGraduation({ academicState: academicState(), capstoneRuns: twoPasses })
  assert.equal(status.graduated, true)
  assert.equal(status.standing, 'A')
  assert.equal(status.qualification, 'advanced_learning_eligible')
  assert.equal(status.advancedLearningEligible, true)
  assert.equal(status.continuingEducationRequired, true)
  assert.equal(status.authorityExpanded, false)
  assert.equal(status.subjectBlockers.length, 0)
  assert.equal(status.languageBlockers.length, 0)
})

test('A+ standing requires every subject and every language at A+ in addition to the generalist capstone', () => {
  const status = deriveCosUniversityGeneralistGraduation({
    academicState: academicState({ subjectTranscript: subjects('A+'), languageTranscript: languages('A+') }),
    capstoneRuns: twoPasses,
  })
  assert.equal(status.graduated, true)
  assert.equal(status.standing, 'A+')
})

test('generalist capstone is deterministic per hidden seed and samples eight University domains including reasoning', () => {
  const first = buildCosUniversityGeneralistCapstoneExam('77777777-7777-4777-8777-777777777777')
  const same = buildCosUniversityGeneralistCapstoneExam('77777777-7777-4777-8777-777777777777')
  const different = buildCosUniversityGeneralistCapstoneExam('88888888-8888-4888-8888-888888888888')
  assert.equal(first.manifestHash, same.manifestHash)
  assert.notEqual(first.manifestHash, different.manifestHash)
  assert.equal(first.selectedSubjectIds.length, 8)
  assert.equal(new Set(first.selectedSubjectIds).size, 8)
  assert.ok(first.selectedSubjectIds.includes('reasoning_decision_science'))
  assert.equal(first.rubric.requiredHeadings.length, 6)
})

test('generalist capstone host scorer requires exact fresh local provenance and all hidden evidence groups', () => {
  const exam = buildCosUniversityGeneralistCapstoneExam('99999999-9999-4999-8999-999999999999')
  const reply = [
    ...exam.rubric.requiredHeadings.map(heading => `${heading}:`),
    ...exam.rubric.requiredGroups.map(group => group[0]),
    'Unknowns remain unverified. The recommendation is conditional and each unresolved item must be verified before irreversible action.',
  ].join('\n')
  const good = scoreCosUniversityGeneralistCapstoneExam(exam, reply, {
    handled: true,
    localReasoning: true,
    externalAi: false,
    semanticCache: false,
    turnId: '99999999-9999-4999-8999-999999999999',
  })
  assert.equal(good.passed, true, good.reasons.join(','))
  const bad = scoreCosUniversityGeneralistCapstoneExam(exam, reply, {
    handled: true,
    localReasoning: true,
    externalAi: true,
    semanticCache: false,
    turnId: '99999999-9999-4999-8999-999999999999',
  })
  assert.equal(bad.passed, false)
  assert.ok(bad.reasons.includes('external_ai_used'))
})

test('generalist capstone ledger is service-only and stores evidence, not a mutable diploma or hidden exam content', () => {
  const schema = file('supabase/migrations/20260908031500_cos_university_generalist_capstone.sql')
  assert.match(schema, /enable row level security/i)
  assert.match(schema, /revoke all on table public\.cos_university_generalist_capstone_runs from anon, authenticated/i)
  assert.match(schema, /grant select, insert, update, delete on table public\.cos_university_generalist_capstone_runs to service_role/i)
  assert.doesNotMatch(schema, /\bgrade\b/i)
  assert.doesNotMatch(schema, /\bgraduated\b/i)
  assert.doesNotMatch(schema, /\bprompt\s+text\b/i)
  assert.doesNotMatch(schema, /\brubric\s+jsonb\b/i)
  assert.doesNotMatch(schema, /\breply\s+text\b/i)
})

test('runtime derives graduation from fresh academic rows and does not persist a graduation flag', () => {
  const runner = file('lib/ai/cos/cosUniversityGraduationRunner.ts')
  assert.match(runner, /academicStateFromRows\(rows, now\)/)
  assert.match(runner, /deriveCosUniversityGeneralistGraduation/)
  assert.match(runner, /COS_UNIVERSITY_GRADUATION_ENABLED/)
  assert.match(runner, /disableCache: true/)
  assert.match(runner, /localModelInvoked/)
  assert.match(runner, /externalAiInvoked/)
  assert.match(runner, /subject_or_language_prerequisites_incomplete/)
  assert.doesNotMatch(runner, /cos_university_graduation_status/)
  assert.doesNotMatch(runner, /\.update\(\{[^}]*graduated/s)
})

test('graduation cron is secret protected and scheduled after subject/language A-range lanes', () => {
  const vercel = JSON.parse(file('vercel.json')) as { env: Record<string, string>; crons: Array<{ path: string; schedule: string }> }
  assert.equal(vercel.env.COS_UNIVERSITY_GRADUATION_ENABLED, 'true')
  assert.deepEqual(vercel.crons.find(row => row.path === '/api/cron/cos-university-a-range'), {
    path: '/api/cron/cos-university-a-range', schedule: '10 7 * * *',
  })
  assert.deepEqual(vercel.crons.find(row => row.path === '/api/cron/cos-university-language-a-range'), {
    path: '/api/cron/cos-university-language-a-range', schedule: '20 7 * * *',
  })
  assert.deepEqual(vercel.crons.find(row => row.path === '/api/cron/cos-university-graduation'), {
    path: '/api/cron/cos-university-graduation', schedule: '30 7 * * *',
  })
  const route = file('app/api/cron/cos-university-graduation/route.ts')
  assert.match(route, /CRON_SECRET/)
  assert.match(route, /auth !== `Bearer \$\{secret\}`/)
  assert.match(route, /runCosUniversityGeneralistGraduationGate/)
  assert.match(route, /maxDuration = 300/)
})
