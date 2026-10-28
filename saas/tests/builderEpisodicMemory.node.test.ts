import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('episodic storage is user scoped and server owned', () => {
  const memory = readFileSync(new URL('../lib/builder/episodic-memory.ts', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../supabase/migrations/20260927033000_builder_episodic_memory.sql', import.meta.url), 'utf8')
  assert.match(memory, /user_id: input\.job\.userId/)
  assert.match(memory, /onConflict: 'job_id'/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all .* anon, authenticated/)
  assert.match(migration, /job_id uuid not null unique/)
})


test('episodic memory redacts credentials and never persists raw Builder traces', () => {
  const memory = readFileSync(new URL('../lib/builder/episodic-memory.ts', import.meta.url), 'utf8')
  const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
  assert.match(memory, /credential-redacted/)
  assert.match(memory, /sanitizedEvidence/)
  assert.doesNotMatch(runner, /evidence:\s*\{[^}]*trace:\s*trace\.slice/s)
})

test('repository repair episode is finalized from Production acceptance or rollback', () => {
  const lifecycle = readFileSync(new URL('../lib/builder/repository-repair-job-lifecycle.ts', import.meta.url), 'utf8')
  assert.match(lifecycle, /recordRepositoryRepairEpisode/)
  assert.match(lifecycle, /production_acceptance_passed/)
  assert.match(lifecycle, /production_acceptance_failed_and_rolled_back/)
  assert.match(lifecycle, /outcome: 'succeeded'/)
  assert.match(lifecycle, /outcome: 'failed'/)
})
