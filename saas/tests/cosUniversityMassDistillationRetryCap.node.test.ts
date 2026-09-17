import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../supabase/migrations/20260917131500_restore_mass_distillation_stage_retry_cap.sql', import.meta.url),
  'utf8',
)

test('mass-distillation recovery cannot retry one provider stage forever', () => {
  assert.match(migration, /select count\(\*\)::integer into v_accepted_attempts[\s\S]*operation=v_operation/)
  assert.match(migration, /if v_accepted_attempts >= 2 then[\s\S]*v_retry_exhausted := v_retry_exhausted \+ 1;[\s\S]*continue;/)
  assert.match(migration, /'maxAcceptedAttemptsPerStage',2/)
  assert.match(migration, /same_campaign_expiration_remaining_budget_and_two_accepted_attempts_per_stage/)
})

test('retry-cap repair does not expand campaign authority', () => {
  assert.match(migration, /automaticPromotionAuthorized',false/)
  assert.match(migration, /runpodMutationAuthorized',false/)
  assert.match(migration, /authorityExpanded',false/)
  assert.doesNotMatch(migration, /automatic_promotion_authorized\s*=\s*true/)
  assert.doesNotMatch(migration, /runpod_mutation_authorized\s*=\s*true/)
  assert.doesNotMatch(migration, /max_total_cost_usd\s*=/)
})
