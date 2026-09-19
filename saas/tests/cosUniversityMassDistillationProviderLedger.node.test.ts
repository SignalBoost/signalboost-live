import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const ROOT = path.resolve(import.meta.dirname, '..')
const ledger = fs.readFileSync(path.join(ROOT, 'lib/ai/cos/cosUniversityHuggingFaceProviderLedger.ts'), 'utf8')
const workflow = fs.readFileSync(path.join(ROOT, 'lib/ai/cos/cosUniversityMassDistillationWorkflow.ts'), 'utf8')
const migration = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260914180000_cos_university_mass_distillation_provider_spend.sql'), 'utf8')

test('mass cron settles durable provider ledger before diagnostics and new paid claims', () => {
  const reconcileAt = workflow.indexOf('await reconcileMassDistillationHuggingFaceProviderLedger({ now, maxJobs: 15 })')
  const diagnoseAt = workflow.indexOf('await diagnoseFailedMassDistillationHuggingFaceJobs({ maxJobs: 5 })')
  const stalledAt = workflow.indexOf('await recoverStalledMassDistillationDispatchClaims({ now, maxRuns: 10 })')
  const recoverAt = workflow.indexOf('await recoverMassDistillationCampaigns({ now, maxCampaigns: 5 })')
  const consumeAt = workflow.indexOf('await runMassDistillationCampaignConsumer({ now, maxDispatches: 5 })')
  assert.ok(reconcileAt >= 0 && diagnoseAt > reconcileAt && stalledAt > diagnoseAt && recoverAt > stalledAt && consumeAt > recoverAt)
})

test('provider ledger hydrates accepted jobs independently of current run stage', () => {
  assert.match(ledger, /teacher_job_id,teacher_job_url,preparation_job_id,preparation_job_url,training_job_id,training_job_url/)
  assert.match(ledger, /mass_distillation_job_dispatched/)
  assert.match(ledger, /cos_university_mass_distillation_provider_jobs/)
  assert.doesNotMatch(ledger, /\.in\('stage', \['teacher_dispatched', 'preparation_dispatched', 'training_dispatched'\]\)/)
})

test('completed provider job gets a callback grace window before fail-closed settlement', () => {
  assert.match(ledger, /CALLBACK_GRACE_MS = 120_000/)
  assert.match(ledger, /waitingForCallback: true/)
  assert.match(ledger, /huggingface_completed_without_callback/)
})

test('terminal provider settlement releases only unused reserve and is idempotent', () => {
  assert.match(migration, /observed_cost_usd numeric/)
  assert.match(migration, /v_release := greatest\(0, v_job\.reserved_cost_usd-v_observed\)/)
  assert.match(migration, /committed_cost_usd=greatest\(0,c\.committed_cost_usd-v_release\)/)
  assert.match(migration, /if v_job\.settled_at is not null then/)
})

test('next stage cannot claim while any accepted provider job for the run is unsettled', () => {
  assert.match(migration, /not exists \([\s\S]*cos_university_mass_distillation_provider_jobs j[\s\S]*j\.run_id=r\.id and j\.settled_at is null/)
})

test('provider ledger never expands promotion, traffic, RunPod, or automatic retry authority', () => {
  assert.match(migration, /automaticRetryAuthorized',false/)
  assert.match(migration, /automatic_promotion_authorized <> false/)
  assert.match(migration, /runpod_mutation_authorized <> false/)
  assert.doesNotMatch(ledger, /automaticPromotionAuthorized:\s*true|runpodMutationAuthorized:\s*true/)
})
