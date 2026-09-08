import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const ROOT = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

test('University practice revalidates the exact plan round after inference and fences reconciliation', () => {
  const runner = file('lib/ai/cos/cosUniversityDeliberatePracticeRunner.ts')
  const inferenceAt = runner.indexOf('execution = await callCosReasoner')
  const postInferenceFenceAt = runner.indexOf("university_practice_post_inference_fence_failed")
  const resultRpcAt = runner.indexOf("db.rpc('cos_record_cognitive_practice_result'")
  assert.ok(inferenceAt >= 0)
  assert.ok(postInferenceFenceAt > inferenceAt)
  assert.ok(resultRpcAt > postInferenceFenceAt)
  assert.match(runner, /practice_round_advanced_during_inference/)
  assert.match(runner, /practice_round_advanced_before_reconciliation/)
  assert.match(runner, /select\('status,evidence,attempt_count'\)/)
  assert.match(runner, /\.eq\('status', 'studying'\)\s*\.eq\('attempt_count', practiceRound\)/)
  assert.match(runner, /return ready && Boolean\(update\.data\?\.id\)/)
})

test('canonical practice-result transaction locks the University queue and exact accepted-study plan before mutation', () => {
  const migration = file('supabase/migrations/20260908234500_cos_university_practice_atomic_result_fence.sql')
  const queueLockAt = migration.indexOf('from public.cos_active_practice_queue')
  const planLockAt = migration.indexOf('from public.cos_university_study_plans')
  const queueMutationAt = migration.indexOf('update public.cos_active_practice_queue')
  const experienceMutationAt = migration.indexOf('insert into public.cos_cognitive_experiences')
  assert.ok(queueLockAt >= 0)
  assert.ok(planLockAt > queueLockAt)
  assert.ok(queueMutationAt > planLockAt)
  assert.ok(experienceMutationAt > queueMutationAt)

  assert.match(migration, /create or replace function public\.cos_record_cognitive_practice_result\(/i)
  assert.match(migration, /where id = p_queue_id\s+for update;/i)
  assert.match(migration, /q\.metadata->>'origin' = 'cos_university_deliberate_practice'/)
  assert.match(migration, /university_plan_id := \(q\.metadata->>'universityPlanId'\)::uuid/)
  assert.match(migration, /university_practice_round := \(q\.metadata->>'practiceRound'\)::integer/)
  assert.match(migration, /where id = university_plan_id\s+and agent_id = 'cos'\s+for update;/i)
  assert.match(migration, /university_plan\.attempt_count <> university_practice_round/)
  assert.match(migration, /university_proof->>'studyAttempt' <> university_practice_round::text/)
  assert.match(migration, /university_proof->>'source' <> 'continuous_learning_accepted_gap'/)
  assert.match(migration, /university_proof->'academicCredit' is distinct from 'false'::jsonb/)
  assert.match(migration, /jsonb_array_length\(university_proof->'evidenceRefs'\) < 1/)
  assert.match(migration, /university_proof_observed_at is distinct from university_plan\.last_attempt_at/)
  assert.match(migration, /university_remediation->'requiresNewStudyAttempt' = 'true'::jsonb/)
  assert.doesNotMatch(migration, /cos_record_university_cognitive_practice_result/)
})
