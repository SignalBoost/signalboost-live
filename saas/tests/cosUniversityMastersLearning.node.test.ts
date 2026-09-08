import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const ROOT = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

test('Master’s learning reuses the existing University study-plan and acquisition engine', () => {
  const runner = file('lib/ai/cos/cosUniversityMastersLearningRunner.ts')
  assert.match(runner, /ContinuousLearningCycle/)
  assert.match(runner, /ContinuousLearningDirector/)
  assert.match(runner, /createLiveLearningAdapters/)
  assert.match(runner, /from\('cos_university_study_plans'\)/)
  assert.match(runner, /academic_level: 'masters'/)
  assert.match(runner, /program_key: `specialist_masters_\$\{programId\}_v1`/)
  assert.match(runner, /module_key: module\.key/)
  assert.match(runner, /markCosUniversityStudyPlansAttempted/)
  assert.doesNotMatch(runner, /recordHostCosUniversityMastersEvidence/)
  assert.doesNotMatch(runner, /cos_university_masters_evidence.*insert/s)
})

test('Master’s study plans are module-specific preparation, never academic credit', () => {
  const runner = file('lib/ai/cos/cosUniversityMastersLearningRunner.ts')
  assert.match(runner, /academicCredit: false/)
  assert.match(runner, /target: 'A\+'/)
  assert.match(runner, /source_kind: 'academic_rotation'/)
  assert.match(runner, /Master’s coursework examination/)
  assert.match(runner, /cosUniversityMastersCourseworkModulePasses/)
})

test('coursework study is recorded only when that exact module retained accepted or probationary evidence', () => {
  const runner = file('lib/ai/cos/cosUniversityMastersLearningRunner.ts')
  assert.match(runner, /for \(const plan of selected\)/)
  assert.match(runner, /new ContinuousLearningCycle\(director, adapters\)\.run\(gaps, 0\)/)
  assert.match(runner, /result\.accepted > 0 \|\| result\.probationary > 0/)
  assert.match(runner, /successfulPlanIds\.push\(plan\.id\)/)
  assert.match(runner, /markCosUniversityStudyPlansAttempted\(successfulPlanIds/)
  assert.doesNotMatch(runner, /markCosUniversityStudyPlansAttempted\(selected\.map/)
})

test('Master’s learning sweeps have their own durable idempotency ledger but not a second corpus', () => {
  const schema = file('supabase/migrations/20260908175500_cos_university_masters_learning_exam_runtime.sql')
  assert.match(schema, /create table if not exists public\.cos_university_masters_learning_runs/i)
  assert.match(schema, /slot_key text not null unique/i)
  assert.match(schema, /enable row level security/i)
  assert.match(schema, /revoke all on table public\.cos_university_masters_learning_runs from anon, authenticated, service_role/i)
  assert.doesNotMatch(schema, /lesson_body/i)
  assert.doesNotMatch(schema, /prompt text/i)
  assert.doesNotMatch(schema, /rubric jsonb/i)
  assert.doesNotMatch(schema, /reply text/i)
  assert.doesNotMatch(schema, /grade text/i)
})

test('shared study-plan schema preserves undergraduate rows while scoping Master’s rows', () => {
  const schema = file('supabase/migrations/20260908175500_cos_university_masters_learning_exam_runtime.sql')
  assert.match(schema, /academic_level text not null default 'undergraduate'/i)
  assert.match(schema, /academic_level in \('undergraduate','masters'\)/i)
  assert.match(schema, /academic_level = 'undergraduate' and program_key is null and module_key is null/i)
  assert.match(schema, /academic_level = 'masters'/i)
  assert.match(schema, /program_key like 'specialist_masters_%_v1'/i)
  assert.match(schema, /length\(btrim\(module_key\)\) > 0/i)
})

test('Master’s learning cron is secret protected, bounded, and scheduled twice hourly', () => {
  const route = file('app/api/cron/cos-university-masters-learning/route.ts')
  const vercel = JSON.parse(file('vercel.json')) as { env: Record<string, string>; crons: Array<{ path: string; schedule: string }> }
  assert.match(route, /CRON_SECRET/)
  assert.match(route, /auth !== `Bearer \$\{secret\}`/)
  assert.match(route, /maxStudyPlans: 2/)
  assert.equal(vercel.env.COS_UNIVERSITY_MASTERS_LEARNING_ENABLED, 'true')
  assert.deepEqual(vercel.crons.find(row => row.path === '/api/cron/cos-university-masters-learning'), {
    path: '/api/cron/cos-university-masters-learning', schedule: '7,37 * * * *',
  })
})
