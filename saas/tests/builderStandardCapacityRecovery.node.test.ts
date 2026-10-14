import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
const cron = readFileSync(new URL('../app/api/cron/builder-continuations/route.ts', import.meta.url), 'utf8')
const sql = readFileSync(new URL('../supabase/migrations/20261013225000_builder_standard_capacity_deferral.sql', import.meta.url), 'utf8')

test('ordinary standard jobs defer busy RunPod with bounded retries before terminal failure', () => {
  assert.match(runner, /MAX_STANDARD_CAPACITY_DEFERRALS = 3/)
  assert.match(runner, /job\.jobKind === 'standard' && error === 'builder_runpod_primary_busy'/)
  assert.match(runner, /metadataCount\(job, 'builderCapacityDeferrals'\) < MAX_STANDARD_CAPACITY_DEFERRALS/)
  assert.match(runner, /result\.error === 'builder_runpod_primary_busy'[\s\S]*await deferSelfHealingCapacity\(job, result\.error, trace\)/)
  assert.match(runner, /if \(await deferSelfHealingCapacity\(job, message, trace\)/)
})
test('capacity queue is cron-owned, cooled down, one job per tick and never replays POST', () => {
  assert.match(cron, /async function queuedCapacityRecovery\(/)
  assert.match(cron, /\.eq\('status', 'queued'\)\.eq\('job_kind', 'standard'\)/)
  assert.match(cron, /builderCapacityDeferredReason/)
  assert.match(cron, /Date\.now\(\) - 60_000/)
  assert.match(cron, /if \(selected\) await runBuilderJob\(selected\.id, selected\.userId\)/)
  assert.doesNotMatch(cron, /enqueueBuilderJob\(/)
})
test('capacity deferral enforces identity, generation, bounded retry and preserves checkpoint', () => {
  assert.match(sql, /status = 'running'[\s\S]*claim_generation = p_generation/)
  assert.match(sql, /not v_self_healing and v_deferrals >= 3/)
  assert.match(sql, /status = 'queued'/)
  assert.match(sql, /builderCapacityDeferredReason/)
  assert.match(sql, /metadata->>'builderCapacityDeferredReason' = 'builder_runpod_primary_busy'/)
  assert.doesNotMatch(sql, /checkpoint = null/)
  assert.doesNotMatch(sql, /delete from public\.builder_workspace_files/i)
})
