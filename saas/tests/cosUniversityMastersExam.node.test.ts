import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  COS_UNIVERSITY_MASTERS_PROGRAMS,
  cosUniversityMastersExpectedAuthority,
  type CosUniversityMastersEvidence,
} from '../lib/ai/cos/cosUniversityMasters.ts'
import {
  buildCosUniversityMastersExam,
  scoreCosUniversityMastersExam,
  selectNextCosUniversityMastersExamTarget,
} from '../lib/ai/cos/cosUniversityMastersExam.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')
const NOW = new Date('2026-10-01T00:00:00Z')

function pass(stage: CosUniversityMastersEvidence['stage'], variantHash: string, extra: Partial<CosUniversityMastersEvidence> = {}): CosUniversityMastersEvidence {
  return {
    programId: 'applied_ai_systems',
    moduleKey: null,
    stage,
    passed: true,
    variantHash,
    observedAt: '2026-09-08T00:00:00Z',
    validUntil: '2027-09-08T00:00:00Z',
    independent: stage !== 'graduate_coursework',
    authority: cosUniversityMastersExpectedAuthority(stage),
    verifiedPractical: stage === 'verified_practical_work' ? true : undefined,
    ...extra,
  }
}

function coursework(): CosUniversityMastersEvidence[] {
  return COS_UNIVERSITY_MASTERS_PROGRAMS.applied_ai_systems.courseworkModuleKeys.map((moduleKey, index) =>
    pass('graduate_coursework', `module-${index}`, { moduleKey }),
  )
}

test('Master’s exam stage selector enforces coursework → depth → transfer → Production → capstone', () => {
  const first = selectNextCosUniversityMastersExamTarget('applied_ai_systems', [], NOW)
  assert.equal(first?.stage, 'graduate_coursework')
  assert.equal(first?.moduleKey, COS_UNIVERSITY_MASTERS_PROGRAMS.applied_ai_systems.courseworkModuleKeys[0])

  const afterCoursework = coursework()
  assert.equal(selectNextCosUniversityMastersExamTarget('applied_ai_systems', afterCoursework, NOW)?.stage, 'independent_specialist_exam')
  afterCoursework.push(pass('independent_specialist_exam', 'd1'), pass('independent_specialist_exam', 'd2'), pass('independent_specialist_exam', 'd3'))
  assert.equal(selectNextCosUniversityMastersExamTarget('applied_ai_systems', afterCoursework, NOW)?.stage, 'cross_domain_transfer')
  afterCoursework.push(pass('cross_domain_transfer', 't1'), pass('cross_domain_transfer', 't2'))
  assert.equal(selectNextCosUniversityMastersExamTarget('applied_ai_systems', afterCoursework, NOW), null)
  afterCoursework.push(pass('verified_practical_work', 'prod1'))
  assert.equal(selectNextCosUniversityMastersExamTarget('applied_ai_systems', afterCoursework, NOW)?.stage, 'masters_capstone')
  afterCoursework.push(pass('masters_capstone', 'c1'), pass('masters_capstone', 'c2'))
  assert.equal(selectNextCosUniversityMastersExamTarget('applied_ai_systems', afterCoursework, NOW), null)
})

test('hidden Master’s exam manifests are deterministic per seed and vary with a fresh seed', () => {
  const target = { programId: 'applied_ai_systems' as const, stage: 'independent_specialist_exam' as const, moduleKey: null }
  const a = buildCosUniversityMastersExam('11111111-1111-4111-8111-111111111111', target)
  const same = buildCosUniversityMastersExam('11111111-1111-4111-8111-111111111111', target)
  const b = buildCosUniversityMastersExam('22222222-2222-4222-8222-222222222222', target)
  assert.equal(a.manifestHash, same.manifestHash)
  assert.notEqual(a.manifestHash, b.manifestHash)
  assert.notEqual(a.prompt, b.prompt)
})

test('host scorer requires fresh local provenance and all hidden evidence groups', () => {
  const exam = buildCosUniversityMastersExam('33333333-3333-4333-8333-333333333333', {
    programId: 'security_and_trust', stage: 'cross_domain_transfer', moduleKey: null,
  })
  const reply = [
    ...exam.rubric.requiredHeadings.map(heading => `${heading}:`),
    ...exam.rubric.requiredGroups.map(group => group[0]),
    'Unknowns remain unproven; choose a reversible action and verify before irreversible change.',
  ].join('\n')
  const good = scoreCosUniversityMastersExam(exam, reply, {
    handled: true, localReasoning: true, externalAi: false, semanticCache: false, turnId: 'turn-1',
  })
  assert.equal(good.passed, true, good.reasons.join(','))
  const bad = scoreCosUniversityMastersExam(exam, reply, {
    handled: true, localReasoning: true, externalAi: true, semanticCache: false, turnId: 'turn-1',
  })
  assert.equal(bad.passed, false)
  assert.ok(bad.reasons.includes('external_ai_used'))
})

test('coursework exam runner requires a studied module before examination and writes only host evidence', () => {
  const runner = file('lib/ai/cos/cosUniversityMastersExamRunner.ts')
  assert.match(runner, /courseworkStudyPlan/)
  assert.match(runner, /\.gt\('attempt_count', 0\)/)
  assert.match(runner, /module_study_required_before_coursework_exam/)
  assert.match(runner, /recordHostCosUniversityMastersEvidence/)
  assert.match(runner, /cosUniversityMastersExpectedAuthority\(target\.stage\)/)
  assert.match(runner, /disableCache: true/)
  assert.match(runner, /localModelInvoked/)
  assert.match(runner, /externalAiInvoked/)
  assert.match(runner, /attachTurnOutcome/)
})

test('Master’s exam ledger stores hidden seed/provenance metadata but no raw exam content', () => {
  const schema = file('supabase/migrations/20260908175500_cos_university_masters_learning_exam_runtime.sql')
  assert.match(schema, /create table if not exists public\.cos_university_masters_exam_runs/i)
  assert.match(schema, /seed text not null/i)
  assert.match(schema, /manifest_hash text not null/i)
  assert.match(schema, /local_model_invoked boolean/i)
  assert.match(schema, /external_ai_invoked boolean/i)
  assert.match(schema, /enable row level security/i)
  assert.doesNotMatch(schema, /prompt text/i)
  assert.doesNotMatch(schema, /rubric jsonb/i)
  assert.doesNotMatch(schema, /reply text/i)
})

test('Master’s practical evidence accepts only explicit verified Production outcomes in core subjects', () => {
  const sync = file('lib/ai/cos/cosUniversityMastersProductionEvidence.ts')
  assert.match(sync, /like\('outcome_source', 'production_verified:%'\)/)
  assert.match(sync, /isCosUniversityVerifiedProductionSource/)
  assert.match(sync, /classifyCosUniversitySubjects/)
  assert.match(sync, /core\.has\(subjectId\)/)
  assert.match(sync, /stage: 'verified_practical_work'/)
  assert.match(sync, /authority: 'verified_production'/)
})

test('Master’s admission learning exam and progress crons are secret-gated and ordered', () => {
  const vercel = JSON.parse(file('vercel.json')) as { env: Record<string, string>; crons: Array<{ path: string; schedule: string }> }
  for (const route of [
    'cos-university-masters-admission', 'cos-university-masters-learning', 'cos-university-masters-exam', 'cos-university-masters-progress',
  ]) {
    assert.match(file(`app/api/cron/${route}/route.ts`), /CRON_SECRET/)
  }
  assert.equal(vercel.env.COS_UNIVERSITY_MASTERS_EXAMS_ENABLED, 'true')
  assert.deepEqual(vercel.crons.find(row => row.path === '/api/cron/cos-university-masters-admission'), {
    path: '/api/cron/cos-university-masters-admission', schedule: '35 7 * * *',
  })
  assert.deepEqual(vercel.crons.find(row => row.path === '/api/cron/cos-university-masters-exam'), {
    path: '/api/cron/cos-university-masters-exam', schedule: '41 * * * *',
  })
  assert.deepEqual(vercel.crons.find(row => row.path === '/api/cron/cos-university-masters-progress'), {
    path: '/api/cron/cos-university-masters-progress', schedule: '51 * * * *',
  })
})
