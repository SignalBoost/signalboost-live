import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration=readFileSync(new URL('../supabase/migrations/20261029123100_builder_preserve_checkpoint_on_stale_expiry.sql',import.meta.url),'utf8')
const cron=readFileSync(new URL('../app/api/cron/builder-continuations/route.ts',import.meta.url),'utf8')

test('stale-expiry SQL protects resumable claims and fresh heartbeats at selection and update',()=>{
  assert.match(migration,/create or replace function public\.expire_stale_builder_jobs/)
  assert.equal((migration.match(/checkpoint is null or job_kind <> 'standard' or claim_generation >= 24 or coalesce/g)||[]).length,2)
  assert.equal((migration.match(/builderStaleRequeues/g)||[]).length,2)
  // Both the row selection and the UPDATE must permit terminalization of exhausted claims.
  assert.match(migration,/claim_generation >= 24/)
  assert.match(migration,/builderStaleRequeues'\)::integer, 0\) >= 3/)
  assert.equal((migration.match(/greatest\(updated_at, coalesce\(last_heartbeat_at, updated_at\)\) <= p_cutoff/g)||[]).length,2)
  assert.match(migration,/for update skip locked/)
  assert.match(migration,/revoke all on function public\.expire_stale_builder_jobs/)
  assert.match(migration,/to service_role/)
})

test('existing continuation cron requeues checkpointed claims before expiring stranded jobs',()=>{
  const recover=cron.indexOf("db.rpc('requeue_stale_builder_claims'")
  const expire=cron.indexOf("db.rpc('expire_stale_builder_jobs'")
  assert.ok(recover>=0&&expire>recover)
  assert.match(cron,/last_heartbeat_at/)
})
