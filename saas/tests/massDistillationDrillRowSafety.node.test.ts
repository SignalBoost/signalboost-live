// saas/tests/massDistillationDrillRowSafety.node.test.ts
// The recovery drill injects a fault into the live batch-runs table, under a live campaign, because that
// is the only place the monitor can see it. These assertions pin the guarantees that stop a drill fixture
// from becoming a paid HF Job and prevent this late migration from rolling back the current claim contract.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../supabase/migrations/20260919040000_mass_distillation_drill_rows.sql', import.meta.url),
  'utf8',
)
const consumer = readFileSync(
  new URL('../lib/ai/cos/cosUniversityMassDistillationConsumer.ts', import.meta.url),
  'utf8',
)

test('the drill marker is additive and indexed only where it is set', () => {
  assert.match(migration, /add column if not exists drill_id text/)
  assert.match(migration, /create index if not exists cos_university_mass_distillation_batch_runs_drill_idx[\s\S]*?where drill_id is not null/)
  assert.doesNotMatch(migration, /drop column|alter column .* type|drop table/i)
})

test('the single claim path refuses drill rows before any prepared work can be selected', () => {
  assert.match(migration, /create or replace function public\.claim_cos_university_mass_distillation_stage\(p_campaign_id uuid\)/)
  const claim = migration.slice(migration.indexOf('select r.* into v_run'))
  assert.ok(claim.indexOf('and r.drill_id is null') >= 0)
  assert.ok(claim.indexOf('and r.drill_id is null') < claim.indexOf("b.status='prepared'"))
  assert.ok(claim.indexOf('and r.drill_id is null') < claim.indexOf('order by r.batch_key asc'))
})

test('a trigger freezes drill rows so no caller can dispatch or launder one', () => {
  assert.match(migration, /create trigger cos_university_mass_distillation_drill_guard[\s\S]*?before update on public\.cos_university_mass_distillation_batch_runs/)
  assert.match(migration, /mass_distillation_drill_row_stage_immutable/)
  assert.match(migration, /mass_distillation_drill_row_marker_immutable/)
})

test('the late drill migration preserves the current campaign and authority fences', () => {
  assert.match(migration, /v_campaign\.status not in \('authorized','active'\)/)
  assert.match(migration, /v_campaign\.authorized_at is null or v_campaign\.authorized_at > v_now/)
  assert.match(migration, /v_campaign\.expires_at is null or v_campaign\.expires_at <= v_now/)
  assert.match(migration, /v_campaign\.automatic_promotion_authorized <> false/)
  assert.match(migration, /v_campaign\.runpod_mutation_authorized <> false/)
  assert.match(migration, /where b\.batch_key=r\.batch_key and b\.status='prepared'/)
  assert.match(migration, /where j\.run_id=r\.id and j\.settled_at is null/)
  assert.match(migration, /for update of r skip locked/)
})

test('the late drill migration preserves current cost accounting and retry semantics', () => {
  assert.match(migration, /v_cost:=0\.200000/)
  assert.match(migration, /v_cost:=0\.015000/)
  assert.match(migration, /v_cost:=1\.610000/)
  assert.match(migration, /round\(v_campaign\.committed_cost_usd\+v_cost,6\) > round\(v_campaign\.max_total_cost_usd,6\)/)
  assert.match(migration, /committed_cost_usd=round\(c\.committed_cost_usd\+v_cost,6\)/)
  assert.match(migration, /failure_reason=null/)
  assert.match(migration, /mass_distillation_campaign_budget_exhausted/)
  assert.doesNotMatch(migration, /set status='completed',completed_at=/)
})

test('claim execution stays service-only and the consumer still uses the governed RPC', () => {
  assert.match(migration, /revoke all on function public\.claim_cos_university_mass_distillation_stage\(uuid\)/)
  assert.match(migration, /grant execute on function public\.claim_cos_university_mass_distillation_stage\(uuid\) to service_role;/)
  assert.match(consumer, /rpc\('claim_cos_university_mass_distillation_stage'/)
})
