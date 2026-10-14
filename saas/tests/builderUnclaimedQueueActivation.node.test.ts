import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const route = readFileSync(new URL('../app/api/cron/builder-continuations/route.ts', import.meta.url), 'utf8')
test('unclaimed jobs are resumed from persisted identity, not replayed via POST', () => {
  assert.match(route, /async function queuedUnclaimedBuilderJob/)
  assert.match(route, /\.eq\('claim_generation', 0\)/)
  assert.match(route, /\.eq\('status', 'queued'\)/)
  assert.match(route, /\.lt\('created_at', new Date\(Date\.now\(\) - 6 \* 60_000\)/)
  assert.match(route, /queuedUnclaimedBuilderJob\(\)/)
  assert.match(route, /unclaimedRecoveryQueued: unclaimedRecovery !== null/)
  assert.doesNotMatch(route, /enqueueBuilderJob\(/)
})
