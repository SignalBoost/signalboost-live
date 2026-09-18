import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../supabase/migrations/20260917142700_close_retry_exhausted_mass_distillation_campaign.sql', import.meta.url),
  'utf8',
)

test('retry-exhausted campaign terminalizes only when no work can still progress', () => {
  assert.match(migration, /v_retry_exhausted > 0/)
  assert.match(migration, /v_budget_blocked=0/)
  assert.match(migration, /v_awaiting_provider_discovery=0/)
  assert.match(migration, /v_awaiting_provider_settlement=0/)
  assert.match(migration, /j\.campaign_id=p_campaign_id and j\.settled_at is null/)
  assert.match(migration, /r\.stage not in \('complete','failed'\)/)
  assert.match(migration, /set status='failed'/)
  assert.match(migration, /'claim','mass_distillation_campaign_terminalized'/)
  assert.match(migration, /'reason','provider_stage_retry_exhausted'/)
})

test('terminalization releases dead campaigns without expanding authority or retries', () => {
  assert.match(migration, /'maxAcceptedAttemptsPerStage',2/)
  assert.match(migration, /'automaticRetryAuthorized',false/)
  assert.match(migration, /'automaticPromotionAuthorized',false/)
  assert.match(migration, /'runpodMutationAuthorized',false/)
  assert.match(migration, /'authorityExpanded',false/)
  assert.doesNotMatch(migration, /automatic_promotion_authorized\s*=\s*true/)
  assert.doesNotMatch(migration, /runpod_mutation_authorized\s*=\s*true/)
  assert.doesNotMatch(migration, /max_total_cost_usd\s*=/)
})
