import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const ROOT = path.resolve(import.meta.dirname, '..')
const migration = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260914190500_fix_mass_distillation_rearm_campaign_columns.sql'),
  'utf8',
)

test('campaign recovery updates only columns that exist on the campaign ledger', () => {
  assert.match(migration, /set status='active', updated_at=v_now/)
  assert.doesNotMatch(migration, /cos_university_mass_distillation_campaigns[\s\S]{0,300}failure_reason\s*=/)
})

test('batch failure evidence is still cleared only when that run is explicitly re-armed', () => {
  assert.match(migration, /set stage=v_pending_stage, stage_reserved_cost_usd=0, stage_idempotency_key=null,[\s\S]*claimed_at=null, failure_reason=null/)
  assert.match(migration, /if v_accepted_attempts >= 2 then[\s\S]*continue/)
  assert.match(migration, /j\.settled_at is null/)
})

test('recovery preserves the original campaign authority fences', () => {
  assert.match(migration, /automatic_promotion_authorized <> false/)
  assert.match(migration, /runpod_mutation_authorized <> false/)
  assert.match(migration, /automaticRetryAuthorized',false/)
  assert.match(migration, /authorityExpanded',false/)
})
