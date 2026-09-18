// saas/tests/cosUniversityMassDistillationRollingAuthorization.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  MASS_DISTILLATION_ROLLING_BATCHES_PER_CAMPAIGN,
  MASS_DISTILLATION_ROLLING_MAX_AUTHORIZED_COST_USD,
  MASS_DISTILLATION_ROLLING_WINDOW_HOURS,
  normalizeMassDistillationRollingAuthorization,
} from '../lib/ai/cos/cosUniversityMassDistillationRollingAuthorization.ts'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('rolling authorization response remains bounded and never carries promotion or RunPod authority', () => {
  const normalized = normalizeMassDistillationRollingAuthorization({
    ok: true,
    authorized: true,
    reason: 'campaign_authorized',
    campaignId: '9d616328-d29a-4c69-9a75-4826497d74c7',
    batchKey: 'a'.repeat(64),
    batchCount: 1,
    campaignMaximumAuthorizedCostUsd: 1.825,
    rollingWindowHours: 24,
    rollingMaximumAuthorizedCostUsd: 25,
    rollingAuthorizedCostUsd: 12.775,
    rollingRemainingAuthorizedCostUsd: 12.225,
    authorizationRef: 'owner_explicit_approval_2026-09-15_rolling_24h_max_25_usd',
    automaticPromotionAuthorized: true,
    runpodMutationAuthorized: true,
    authorityExpanded: true,
  })
  assert.equal(MASS_DISTILLATION_ROLLING_WINDOW_HOURS, 24)
  assert.equal(MASS_DISTILLATION_ROLLING_MAX_AUTHORIZED_COST_USD, null)
  assert.equal(MASS_DISTILLATION_ROLLING_BATCHES_PER_CAMPAIGN, 1)
  assert.equal(normalized.ok, true)
  assert.equal(normalized.authorized, true)
  assert.equal(normalized.rollingRemainingAuthorizedCostUsd, 12.225)
  assert.equal(normalized.automaticPromotionAuthorized, false)
  assert.equal(normalized.runpodMutationAuthorized, false)
  assert.equal(normalized.authorityExpanded, false)
})

test('database rolling policy serializes workers and counts worst-case campaign authority', () => {
  const sql = source('../supabase/migrations/20260915234000_cos_university_mass_distillation_rolling_authority.sql')
  assert.match(sql, /max_authorized_cost_usd <= 25\.000000/)
  assert.match(sql, /batches_per_campaign = 1/)
  assert.match(sql, /max_concurrent_campaigns = 1/)
  assert.match(sql, /rolling_window = interval '24 hours'/)
  assert.match(sql, /owner_explicit_approval_2026-09-15_rolling_24h_max_25_usd/)
  assert.match(sql, /for update;/i)
  assert.match(sql, /sum\(c\.max_total_cost_usd\)/)
  assert.match(sql, /round\(v_window_authorized \+ v_next_cost,6\) > round\(v_policy\.max_authorized_cost_usd,6\)/)
  assert.match(sql, /not exists \([\s\S]*cos_university_mass_distillation_batch_runs/)
  assert.match(sql, /for update skip locked/)
  assert.match(sql, /authorize_cos_university_mass_distillation_campaign\(/)
  assert.match(sql, /automatic_promotion_authorized boolean not null default false/)
  assert.match(sql, /runpod_mutation_authorized boolean not null default false/)
  assert.match(sql, /revoke all on function public\.authorize_next_cos_university_mass_distillation_campaign\(\)/)
  assert.match(sql, /security definer[\s\S]*authorize_next_cos_university_mass_distillation_campaign|authorize_next_cos_university_mass_distillation_campaign\(\)[\s\S]*security definer/i)
  assert.match(sql, /revoke execute on function public\.authorize_cos_university_mass_distillation_campaign\(text\[\],numeric,text,interval\)[\s\S]*from service_role/)
  assert.doesNotMatch(sql, /sum\(c\.committed_cost_usd\)/)
  assert.doesNotMatch(sql, /automatic_promotion_authorized\s*=\s*true|runpod_mutation_authorized\s*=\s*true/)
})

test('forward migration hardens databases that already applied the rolling policy', () => {
  const sql = source('../supabase/migrations/20260916003402_harden_university_rolling_distillation_authority.sql')
  assert.match(sql, /alter function public\.authorize_next_cos_university_mass_distillation_campaign\(\)[\s\S]*security definer/)
  assert.match(sql, /revoke execute on function public\.authorize_cos_university_mass_distillation_campaign\(text\[\],numeric,text,interval\)[\s\S]*from service_role/)
  assert.match(sql, /notify pgrst, 'reload schema'/)
})

test('canonical workflow dispatches authorized work before slower curriculum maintenance', () => {
  const workflow = source('../lib/ai/cos/cosUniversityMassDistillationWorkflow.ts')
  const throughput = workflow.indexOf('massDistillationThroughputProfile()')
  const packaging = workflow.indexOf('prepareUniversityMassDistillationCurriculum(now')
  const authorization = workflow.indexOf('authorizeNextUniversityMassDistillationCampaign()')
  const dispatch = workflow.indexOf('runMassDistillationCampaignConsumer({ now, maxDispatches: 3 })')
  assert.ok(throughput > 0)
  assert.ok(authorization > throughput)
  assert.ok(dispatch > authorization)
  assert.ok(packaging > dispatch)
  assert.match(workflow, /massDistillationDispatchReadiness/)
  assert.match(workflow, /dispatch before semantic\/curriculum maintenance|Dispatch is the critical path/)
  assert.match(workflow, /throughput\.corpusScanRows/)
  assert.match(workflow, /throughput\.maxBatchesPerSweep/)
})

test('owner removed the rolling 24-hour ceiling without widening any other authority', () => {
  const sql = source('../supabase/migrations/20260916190000_remove_university_mass_distillation_rolling_ceiling.sql')
  assert.match(sql, /alter column max_authorized_cost_usd drop not null/)
  assert.match(sql, /set max_authorized_cost_usd = null/)
  assert.match(sql, /owner_explicit_direction_2026-09-16_no_rolling_ceiling/)
  assert.match(sql, /if v_policy\.max_authorized_cost_usd is not null\s+and round\(v_window_authorized \+ v_next_cost,6\) > round\(v_policy\.max_authorized_cost_usd,6\)/)
  assert.match(sql, /v_next_cost constant numeric\(10,6\) := 1\.825000/)
  assert.match(sql, /v_active_campaigns >= v_policy\.max_concurrent_campaigns or v_unsettled_jobs > 0/)
  assert.match(sql, /security definer/)
  assert.match(sql, /grant execute on function public\.authorize_next_cos_university_mass_distillation_campaign\(\)\s+to service_role/)
  assert.doesNotMatch(sql, /automatic_promotion_authorized\s*=\s*true|runpod_mutation_authorized\s*=\s*true/)
  assert.doesNotMatch(sql, /max_concurrent_campaigns\s*=\s*[2-9]|batches_per_campaign\s*=\s*[2-9]/)
})

test('an uncapped response reports no ceiling instead of a misleading zero remaining', () => {
  const normalized = normalizeMassDistillationRollingAuthorization({
    ok: true, authorized: true, reason: 'campaign_authorized', rollingCeilingRemoved: true,
    rollingMaximumAuthorizedCostUsd: null, rollingAuthorizedCostUsd: 27.375, rollingRemainingAuthorizedCostUsd: null,
  })
  assert.equal(normalized.rollingCeilingRemoved, true)
  assert.equal(normalized.rollingMaximumAuthorizedCostUsd, null)
  assert.equal(normalized.rollingRemainingAuthorizedCostUsd, null)
  assert.equal(normalized.rollingAuthorizedCostUsd, 27.375)
  assert.equal(normalized.automaticPromotionAuthorized, false)
})
