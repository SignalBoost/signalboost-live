import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const sql = readFileSync(new URL('../supabase/migrations/20261029145000_builder_expire_exhausted_checkpoint_claims.sql', import.meta.url), 'utf8')
test('stale expiry allows exhausted claims but preserves recoverable checkpoints and fresh heartbeat', () => {
  assert.equal((sql.match(/checkpoint is null or job_kind <> 'standard' or claim_generation >= 24 or coalesce/g) || []).length, 2)
  assert.equal((sql.match(/builderStaleRequeues/g) || []).length, 2)
  assert.equal((sql.match(/greatest\(updated_at, coalesce\(last_heartbeat_at, updated_at\)\) <= p_cutoff/g) || []).length, 2)
  assert.match(sql, /for update skip locked/)
  assert.match(sql, /grant execute on function public\.expire_stale_builder_jobs\(uuid, timestamptz, uuid, uuid\) to service_role/)
})
