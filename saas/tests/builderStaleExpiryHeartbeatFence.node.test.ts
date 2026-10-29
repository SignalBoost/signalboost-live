import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../supabase/migrations/20261029130000_builder_stale_expiry_heartbeat_fence.sql', import.meta.url), 'utf8')
test('stale Builder expiry rechecks checkpoint and heartbeat in both row selection and conditional update', () => {
  const checkpoint = "and checkpoint is null"
  const heartbeat = "and greatest(updated_at, coalesce(last_heartbeat_at, updated_at)) <= p_cutoff"
  assert.equal(migration.split(checkpoint).length - 1, 2)
  assert.equal(migration.split(heartbeat).length - 1, 2)
  assert.match(migration,/for update skip locked/)
  assert.match(migration,/and status = 'running' and claim_generation > 0/)
})
test('stale expiry maintains owner scope, History transaction and service-only execution', () => {
  assert.match(migration,/where user_id = p_user_id/)
  assert.match(migration,/where id = v_job.id\s+and user_id = p_user_id/)
  assert.match(migration,/update public.assistant_messages/)
  assert.match(migration,/revoke all on function public.expire_stale_builder_jobs/)
  assert.match(migration,/grant execute on function public.expire_stale_builder_jobs[\s\S]*to service_role/)
})
test.todo('staging integration: heartbeat refresh racing worker-loss expiry retains running claim')
test.todo('staging integration: nonnull checkpoint is never marked worker_lost by generic expiry')
test.todo('staging integration: genuinely abandoned no-checkpoint claim expires atomically and updates History')
