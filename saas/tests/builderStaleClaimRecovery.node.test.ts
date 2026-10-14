import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('server cron atomically recovers expired running Builder claims before draining continuations', () => {
  const cron = readFileSync(new URL('../app/api/cron/builder-continuations/route.ts', import.meta.url), 'utf8')
  const sql = readFileSync(new URL('../supabase/migrations/20261014170000_builder_stale_claim_recovery.sql', import.meta.url), 'utf8')
  assert.match(cron, /requeue_stale_builder_claims/)
  assert.ok(cron.indexOf('requeue_stale_builder_claims') < cron.indexOf('await listBuilderContinuations()'))
  assert.match(sql, /for update skip locked/)
  assert.match(sql, /status = 'paused', claim_generation = claim_generation \+ 1/)
  assert.match(sql, /checkpoint is not null/)
  assert.match(sql, /builder_verification_lease_expired/)
  assert.match(sql, /builderStaleRequeues/)
  assert.match(sql, /builderStaleRequeues'\)::integer,0\) < 3/)
  assert.doesNotMatch(sql, /delete from public.builder_workspace_files|status = 'failed'/)
})
