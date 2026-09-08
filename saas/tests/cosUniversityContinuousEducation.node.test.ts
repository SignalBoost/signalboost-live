import './cosUniversityExamRemediation.node.test.ts'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  COS_UNIVERSITY_CONTINUOUS_SWEEP_MINUTES,
  COS_UNIVERSITY_STUDY_COOLDOWN_MINUTES,
  cosUniversityContinuousSlotKey,
  cosUniversityPlanEligibleForContinuousStudy,
} from '../lib/ai/cos/cosUniversityContinuousCadence.ts'

const root = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8')

test('continuous University cadence uses four deterministic sweeps per hour', () => {
  assert.equal(COS_UNIVERSITY_CONTINUOUS_SWEEP_MINUTES, 15)
  assert.equal(cosUniversityContinuousSlotKey(new Date('2026-09-08T12:00:01Z')), '2026-09-08T12:00')
  assert.equal(cosUniversityContinuousSlotKey(new Date('2026-09-08T12:14:59Z')), '2026-09-08T12:00')
  assert.equal(cosUniversityContinuousSlotKey(new Date('2026-09-08T12:15:00Z')), '2026-09-08T12:15')
  assert.equal(cosUniversityContinuousSlotKey(new Date('2026-09-08T12:47:00Z')), '2026-09-08T12:45')
})

test('study cooldown prevents rereading the same plan continuously without blocking future study', () => {
  assert.equal(COS_UNIVERSITY_STUDY_COOLDOWN_MINUTES, 60)
  const now = new Date('2026-09-08T12:00:00Z')
  assert.equal(cosUniversityPlanEligibleForContinuousStudy({ id: 'a', status: 'queued', lastAttemptAt: null }, now), true)
  assert.equal(cosUniversityPlanEligibleForContinuousStudy({ id: 'a', status: 'studying', lastAttemptAt: '2026-09-08T11:01:01Z' }, now), false)
  assert.equal(cosUniversityPlanEligibleForContinuousStudy({ id: 'a', status: 'studying', lastAttemptAt: '2026-09-08T11:00:00Z' }, now), true)
  assert.equal(cosUniversityPlanEligibleForContinuousStudy({ id: 'a', status: 'completed', lastAttemptAt: null }, now), false)
  assert.equal(cosUniversityPlanEligibleForContinuousStudy({ id: 'a', status: 'superseded', lastAttemptAt: null }, now), false)
})

test('continuous learner plans broadly, prioritizes failed independent exams, executes bounded current University work, and never grades itself', () => {
  const runtime = file('lib/ai/cos/cosUniversityContinuousLearning.ts')
  assert.match(runtime, /ensureCosUniversityExamFailureRemediationPlans/)
  assert.match(runtime, /examFailuresPrioritized/)
  assert.match(runtime, /runCosUniversityPlanningCycle\(\{ now, maxPlans: 12 \}\)/)
  assert.match(runtime, /maxStudyPlans \|\| 4/)
  assert.match(runtime, /generateKnowledgeGaps\(signals\)/)
  assert.match(runtime, /ContinuousLearningDirector/)
  assert.match(runtime, /markCosUniversityStudyPlansAttempted/)
  assert.match(runtime, /cos_university_continuous_runs/)
  assert.doesNotMatch(runtime, /recordCosUniversityAssessment/)
  assert.doesNotMatch(runtime, /scoreCosUniversityBlindExam/)
  assert.doesNotMatch(runtime, /scoreCosUniversityARangeExam/)
})

test('University practice queue discards superseded rounds without deleting audit evidence', () => {
  const discipline = file('lib/ai/cos/cosUniversityPracticeQueueDiscipline.ts')
  assert.match(discipline, /classifyCosUniversityQueuedPractice/)
  assert.match(discipline, /Math\.floor\(practiceRound\) !== currentPracticeRound\(plan\)/)
  assert.match(discipline, /status: 'discarded'/)
  assert.match(discipline, /university_practice_superseded_by_current_study_round/)
  assert.match(discipline, /completed_at: nowIso/)
  assert.doesNotMatch(discipline, /\.delete\(\)/)
})

test('University practice current academic priority outranks old current backlog without destroying it', () => {
  const discipline = file('lib/ai/cos/cosUniversityPracticeQueueDiscipline.ts')
  assert.match(discipline, /order\('priority', \{ ascending: false \}\)/)
  assert.match(discipline, /order\('last_attempt_at', \{ ascending: false \}\)/)
  assert.match(discipline, /return 'defer_lower_priority'/)
  assert.match(discipline, /university_practice_deferred_for_higher_academic_priority/)
  assert.match(discipline, /LOWER_PRIORITY_DEFERRAL_MS = 14 \* 60_000/)
  assert.match(discipline, /selectedPlanIds/)
})

test('University practice preparation cannot outpace the normal two-exercise execution budget', () => {
  const route = file('app/api/cron/cos-university-practice/route.ts')
  const disciplineAt = route.indexOf('await disciplineCosUniversityPracticeQueue')
  const practiceAt = route.indexOf('await runCosUniversityDeliberatePractice')
  assert.ok(disciplineAt >= 0)
  assert.ok(practiceAt > disciplineAt)
  assert.match(route, /disciplineCosUniversityPracticeQueue\(\{ maxActivePlans: 1 \}\)/)
  assert.match(route, /runCosUniversityDeliberatePractice\(\{ maxPlans: 1, maxExercises: 2 \}\)/)
  assert.match(route, /queueDiscipline/)
})

test('exam lanes remain independent from continuous study cadence', () => {
  const vercel = JSON.parse(file('vercel.json')) as { env: Record<string, string>; crons: Array<{ path: string; schedule: string }> }
  assert.equal(vercel.env.COS_UNIVERSITY_CONTINUOUS_ENABLED, 'true')
  assert.deepEqual(vercel.crons.find(item => item.path === '/api/cron/cos-university-learning'), {
    path: '/api/cron/cos-university-learning', schedule: '*/15 * * * *',
  })
  assert.deepEqual(vercel.crons.find(item => item.path === '/api/cron/cos-university-exam'), {
    path: '/api/cron/cos-university-exam', schedule: '0 7 * * *',
  })
  assert.deepEqual(vercel.crons.find(item => item.path === '/api/cron/cos-university-a-range'), {
    path: '/api/cron/cos-university-a-range', schedule: '10 7 * * *',
  })
})

test('continuous learning sweep ledger is service-only and stores no hidden exam material or grade', () => {
  const schema = file('supabase/migrations/20260908021500_cos_university_continuous_learning_runs.sql')
  assert.match(schema, /enable row level security/i)
  assert.match(schema, /revoke all on table public\.cos_university_continuous_runs from anon, authenticated/i)
  assert.match(schema, /grant all on table public\.cos_university_continuous_runs to service_role/i)
  assert.doesNotMatch(schema, /\bprompt\b/i)
  assert.doesNotMatch(schema, /\brubric\b/i)
  assert.doesNotMatch(schema, /\breply\b/i)
  assert.doesNotMatch(schema, /\bgrade\b/i)
})

test('cron route is secret-protected and invokes only the continuous learning lane', () => {
  const route = file('app/api/cron/cos-university-learning/route.ts')
  assert.match(route, /CRON_SECRET/)
  assert.match(route, /Bearer \$\{secret\}/)
  assert.match(route, /runCosUniversityContinuousLearning/)
  assert.doesNotMatch(route, /runCosUniversityIndependentExamBatch/)
  assert.doesNotMatch(route, /runCosUniversityARangeBatch/)
})
