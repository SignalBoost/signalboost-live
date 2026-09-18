import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

function source(relative: string) {
  return fs.readFileSync(path.join(import.meta.dirname, relative), 'utf8')
}

test('mass campaign migration separates prepared curriculum from paid authorization', () => {
  const sql = source('../supabase/migrations/20260914155000_cos_university_mass_distillation_campaign_consumer.sql')
  assert.match(sql, /cos_university_mass_distillation_campaigns/)
  assert.match(sql, /cos_university_mass_distillation_batch_runs/)
  assert.match(sql, /max_total_cost_usd <= batch_count \* 1\.825000/)
  assert.match(sql, /v_ceiling := 0\.200000/)
  assert.match(sql, /v_ceiling := 0\.015000/)
  assert.match(sql, /v_ceiling := 1\.610000/)
  assert.match(sql, /automatic_promotion_authorized boolean not null default false/)
  assert.match(sql, /runpod_mutation_authorized boolean not null default false/)
  assert.match(sql, /unique \(batch_key\)/)
  assert.doesNotMatch(sql, /update public\.cos_university_distillation_curriculum_batches[\s\S]*dispatch_authorized\s*=\s*true/i)
})

test('follow-up claim migration qualifies every batch-run reference against RETURNS TABLE output names', () => {
  const sql = source('../supabase/migrations/20260914162000_cos_university_mass_distillation_claim_qualification.sql')
  assert.match(sql, /from public\.cos_university_mass_distillation_batch_runs r/)
  assert.match(sql, /where r\.campaign_id = p_campaign_id/)
  assert.match(sql, /and r\.stage in \('teacher_pending','preparation_pending','training_pending'\)/)
  assert.match(sql, /order by r\.batch_key/)
  assert.match(sql, /where r\.campaign_id=p_campaign_id and r\.stage <> 'complete'/)
  assert.match(sql, /where r\.id=v_run\.id/)
  assert.doesNotMatch(sql, /\n\s*where campaign_id\s*=\s*p_campaign_id/)
  assert.doesNotMatch(sql, /\n\s*and stage in \(/)
})

test('mass consumer spends only through the bounded Hugging Face stages and never mutates RunPod', () => {
  const consumer = source('../lib/ai/cos/cosUniversityMassDistillationConsumer.ts')
  assert.match(consumer, /MASS_DISTILLATION_TEACHER_COST_CEILING_USD = 0\.20/)
  assert.match(consumer, /MASS_DISTILLATION_PREPARATION_COST_CEILING_USD = 0\.015/)
  assert.match(consumer, /MASS_DISTILLATION_TRAINING_COST_CEILING_USD = 1\.61/)
  assert.match(consumer, /claim_cos_university_mass_distillation_stage/)
  assert.match(consumer, /COS_UNIVERSITY_TRAINING_EXECUTOR_DISPATCH_ENABLED/)
  assert.match(consumer, /submitHuggingFaceJob/)
  assert.match(consumer, /findHuggingFaceJobByName/)
  assert.match(consumer, /failed_stages_scheduled_for_bounded_retry_while_other_campaign_work_continues/)
  assert.match(consumer, /automaticRetryAuthorized: true/)
  assert.match(consumer, /trafficAuthorized: false/)
  assert.doesNotMatch(consumer, /runpod\.ai|RUNPOD_API_KEY|reconcileRunpod|provisionRunpod|canaryRunpod/)
})

test('a failed or blocked campaign cannot starve later authorized campaigns', () => {
  const consumer = source('../lib/ai/cos/cosUniversityMassDistillationConsumer.ts')
  assert.match(consumer, /\.limit\(100\)/)
  assert.match(consumer, /const campaignRows: any\[\] = campaigns\.data \|\| \[\]/)
  assert.match(consumer, /\(index \+ offset\) % campaignRows\.length/)
  assert.match(consumer, /unavailableCampaignIds/)
  assert.match(consumer, /failures\.push\([\s\S]*phase: 'claim'/)
  assert.match(consumer, /failures\.push\([\s\S]*phase: 'dispatch'/)
  assert.match(consumer, /reason: 'no_claimable_campaign'/)
  assert.doesNotMatch(consumer, /campaign_stopped_on_first_failed/)
})

test('every paid stage rechecks source semantic cohesion before dispatch', () => {
  const consumer = source('../lib/ai/cos/cosUniversityMassDistillationConsumer.ts')
  assert.match(consumer, /assertMassDistillationSourceCohesion/)
  assert.match(consumer, /resolveMassDistillationSubject/)
  assert.match(consumer, /mass_distillation_source_subject_recheck_failed/)
  assert.ok(
    consumer.indexOf('await assertMassDistillationSourceCohesion') < consumer.indexOf('return { run, batch, sourceHashes }'),
  )
})

test('semantic source failures are terminal, quarantined, and excluded from scheduled retry', () => {
  const consumer = source('../lib/ai/cos/cosUniversityMassDistillationConsumer.ts')
  assert.match(consumer, /function terminalBatchFailure/)
  assert.match(consumer, /mass_distillation_source_subject_recheck_missing/)
  assert.match(consumer, /mass_distillation_source_subject_recheck_failed:/)
  assert.match(consumer, /status: 'quarantined'/)
  assert.match(consumer, /automaticRetryAuthorized: !terminal/)
  assert.match(consumer, /claim: terminal \? 'mass_distillation_batch_terminal_failure'/)
  assert.match(consumer, /retryableFailedRuns = \(failedRuns\.data \|\| \[\]\)\.filter/)
  assert.match(consumer, /!terminalBatchFailure\(clean\(row\.failure_reason, 300\)\)/)
})

test('worker callbacks advance teacher to partitions to training to evaluation without promoting traffic', () => {
  const consumer = source('../lib/ai/cos/cosUniversityMassDistillationConsumer.ts')
  assert.match(consumer, /teacher_dataset_registered/)
  assert.match(consumer, /partition_manifests_registered/)
  assert.match(consumer, /trained_artifact_registered/)
  assert.match(consumer, /rollback_artifact_registered/)
  assert.match(consumer, /stage: 'preparation_pending'/)
  assert.match(consumer, /stage: 'training_pending'/)
  assert.match(consumer, /status: 'evaluation_pending'/)
  assert.match(consumer, /nextGate: 'independent_evaluation'/)
})

test('mass campaign has a signed callback and a bounded scheduled consumer', () => {
  const callback = source('../app/api/internal/cos/mass-distillation/evidence/route.ts')
  const cron = source('../app/api/cron/cos-university-mass-distillation/route.ts')
  const workflow = source('../lib/ai/cos/cosUniversityMassDistillationWorkflow.ts')
  const vercel = source('../vercel.json')
  assert.match(callback, /verifyTrainingExecutorPayload/)
  assert.match(callback, /recordMassDistillationWorkerEvidence/)
  assert.match(cron, /CRON_SECRET/)
  assert.match(cron, /runCosUniversityMassDistillationWorkflow/)
  assert.match(workflow, /recoverStalledMassDistillationDispatchClaims\(\{ now, maxRuns: 10 \}\)/)
  assert.match(workflow, /recoverMassDistillationCampaigns\(\{ now, maxCampaigns: 5 \}\)/)
  assert.match(workflow, /maxDispatches: 3/)
  assert.match(vercel, /\/api\/cron\/cos-university-mass-distillation/)
})


test('backfills parent campaign terminal state for pre-existing semantic failures', () => {
  const consumer = source('../lib/ai/cos/cosUniversityMassDistillationConsumer.ts')
  assert.match(consumer, /const terminalFailedRuns = \(failedRuns\.data \|\| \[\]\)\.filter/)
  assert.match(consumer, /terminalBatchFailure\(clean\(row\.failure_reason, 300\)\)/)
  assert.match(consumer, /const terminalCampaignIds = \[\.\.\.new Set\(terminalFailedRuns\.map/)
  assert.match(consumer, /\.update\(\{ status: 'failed', completed_at: now, updated_at: now \}\)/)
  assert.match(consumer, /\.in\('status', \['authorized', 'active'\]\)/)
})
