// saas/tests/cosUniversityMassDistillationBudgetExhaustion.node.test.ts
// Production 2026-09-19: 16 failed non-drill batch runs had accumulated with no path forward. A failed run
// whose campaign has no budget left is skipped by the re-arm loop (counted as budget-blocked), and the
// terminal-closure branch required budget-blocked to be zero - so the campaign could neither retry nor close.
// These assertions pin the corrected boundary: budget exhaustion closes, in-flight work still waits.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../supabase/migrations/20260919170000_close_budget_exhausted_mass_distillation_campaign.sql', import.meta.url),
  'utf8',
)
const previous = readFileSync(
  new URL('../supabase/migrations/20260917142700_close_retry_exhausted_mass_distillation_campaign.sql', import.meta.url),
  'utf8',
)

test('an unfundable failed run can now close its campaign', () => {
  assert.match(migration, /\(v_retry_exhausted > 0 or v_budget_blocked > 0\)/)
  // The old condition is what trapped those runs; it must be gone.
  assert.doesNotMatch(migration, /and v_budget_blocked=0/)
  assert.match(previous, /and v_budget_blocked=0/)
})

test('work still in flight continues to block closure', () => {
  // These resolve with time; budget exhaustion never does.
  assert.match(migration, /and v_awaiting_provider_discovery=0/)
  assert.match(migration, /and v_awaiting_provider_settlement=0/)
  assert.match(migration, /where j\.campaign_id=p_campaign_id and j\.settled_at is null/)
  assert.match(migration, /if v_nonterminal_runs=0 then/)
})

test('re-arming still takes precedence over closing', () => {
  // A campaign that can still pay retries; closure is only the else branch.
  const rearm = migration.indexOf('if v_rearmed > 0 then')
  const close = migration.indexOf('or v_budget_blocked > 0')
  assert.ok(rearm > 0 && close > rearm, 'the re-arm branch must precede the closure branch')
  assert.match(migration, /set status='active', updated_at=v_now/)
})

test('the evidence names which exhaustion closed the campaign', () => {
  assert.match(migration, /'campaign_budget_exhausted'/)
  assert.match(migration, /'retry_exhausted_and_budget_exhausted'/)
  assert.match(migration, /'provider_stage_retry_exhausted'/)
  assert.match(migration, /'budgetBlockedRuns',v_budget_blocked/)
})

test('closing spends nothing and expands no authority', () => {
  assert.match(migration, /'automaticRetryAuthorized',false/)
  assert.match(migration, /'automaticPromotionAuthorized',false/)
  assert.match(migration, /'runpodMutationAuthorized',false/)
  assert.match(migration, /'authorityExpanded',false/)
  // No dispatch, and no raising of a campaign ceiling.
  assert.doesNotMatch(migration, /set max_total_cost_usd/)
})

test('the released-reservation behaviour is carried over unchanged', () => {
  // The run's own reservation is released before the budget check, which is precisely why the shortfall
  // is permanent rather than temporary.
  assert.match(migration, /set committed_cost_usd=greatest\(0,c\.committed_cost_usd-v_release\), updated_at=v_now/)
  assert.match(migration, /if round\(v_campaign\.committed_cost_usd\+v_stage_cost,6\) > round\(v_campaign\.max_total_cost_usd,6\) then/)
})

test('closure remains scoped to the one campaign it was called for', () => {
  assert.match(migration, /where c\.id=p_campaign_id and c\.status in \('authorized','active','running','failed'\)/)
  assert.doesNotMatch(migration, /update public\.cos_university_mass_distillation_campaigns c\s*\n\s*set status='failed'[\s\S]{0,120}where c\.status/)
})
