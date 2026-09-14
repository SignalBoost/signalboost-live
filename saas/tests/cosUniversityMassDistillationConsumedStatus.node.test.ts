import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const ROOT = path.resolve(import.meta.dirname, '..')
const migration = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260914192000_canonicalize_mass_distillation_consumed_status.sql'),
  'utf8',
)

test('legacy retired writes are canonicalized to the schema terminal state consumed', () => {
  assert.match(migration, /if new\.status = 'retired' then/)
  assert.match(migration, /new\.status := 'consumed'/)
  assert.match(migration, /new\.consumed_at := coalesce\(new\.consumed_at, clock_timestamp\(\)\)/)
  assert.match(migration, /before insert or update of status/)
})

test('already complete runs are backfilled without touching incomplete curriculum', () => {
  assert.match(migration, /r\.stage='complete'/)
  assert.match(migration, /b\.status='prepared'/)
  assert.match(migration, /set status='consumed'/)
  assert.match(migration, /consumed_at=coalesce\(b\.consumed_at,r\.completed_at,clock_timestamp\(\)\)/)
})

test('compatibility fix does not widen spend or promotion authority', () => {
  assert.doesNotMatch(migration, /max_total_cost_usd|committed_cost_usd|automatic_promotion_authorized|runpod_mutation_authorized|dispatch_authorized\s*=/)
})
