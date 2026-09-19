// saas/tests/massDistillationDrillRowSafety.node.test.ts
// The recovery drill injects a fault into the live batch-runs table, under a live campaign, because that
// is the only place the monitor can see it. These assertions pin the guarantees that stop a drill fixture
// from becoming a paid HF Job.
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
  // Additive only: the drill must not alter or drop anything the pipeline already depends on.
  assert.doesNotMatch(migration, /drop column|alter column .* type|drop table/i)
})

test('the single claim path refuses drill rows', () => {
  assert.match(migration, /create or replace function public\.claim_cos_university_mass_distillation_stage\(p_campaign_id uuid\)/)
  assert.match(migration, /and r\.drill_id is null/)
  // The claim is the only place work is picked up, so the exclusion sits with the stage predicate.
  const claim = migration.slice(migration.indexOf('select r.* into v_run'))
  assert.ok(claim.indexOf('and r.drill_id is null') < claim.indexOf('order by r.batch_key'))
})

test('a trigger freezes drill rows so no caller can dispatch one', () => {
  assert.match(migration, /create trigger cos_university_mass_distillation_drill_guard[\s\S]*?before update on public\.cos_university_mass_distillation_batch_runs/)
  assert.match(migration, /mass_distillation_drill_row_stage_immutable/)
  // The marker itself cannot be cleared to launder a drill row into real work.
  assert.match(migration, /mass_distillation_drill_row_marker_immutable/)
})

test('every budget, ceiling and campaign gate is carried over unchanged', () => {
  assert.match(migration, /if v_campaign\.status not in \('authorized','active'\) then return; end if;/)
  assert.match(migration, /v_ceiling:=0\.200000/)
  assert.match(migration, /v_ceiling:=0\.015000/)
  assert.match(migration, /v_ceiling:=1\.610000/)
  assert.match(migration, /mass_distillation_campaign_budget_exhausted/)
  assert.match(migration, /for update skip locked/)
  assert.match(migration, /revoke all on function public\.claim_cos_university_mass_distillation_stage\(uuid\)/)
  assert.match(migration, /grant execute on function public\.claim_cos_university_mass_distillation_stage\(uuid\) to service_role;/)
})

test('the consumer still claims through the single governed RPC', () => {
  // If this ever moves back to a direct table query, the SQL exclusion stops protecting dispatch.
  assert.match(consumer, /rpc\('claim_cos_university_mass_distillation_stage'/)
})
