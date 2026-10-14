import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
const route = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
const boundary = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')
const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
const sql = readFileSync(new URL('../supabase/migrations/20261013225000_builder_standard_capacity_deferral.sql', import.meta.url), 'utf8')
test('durable capacity deferral is exposed as queued rather than terminal error', () => {
  assert.match(route, /job\.metadata\.builderCapacityDeferredReason === 'builder_runpod_primary_busy'/)
  assert.match(route, /Queued — waiting for model capacity/)
  assert.match(route, /job\.status === 'queued' \|\| job\.status === 'running' \|\| job\.status === 'paused'/)
  assert.match(sql, /set status = 'queued', error = null/)
  assert.match(runner, /await deferSelfHealingCapacity\(job, result\.error, trace\)\) return/)
})
test('accepted Builder POST releases foreground and never replays action', () => {
  assert.match(route, /status: 'queued'/)
  assert.match(route, /\}, \{ status: 202 \}\)/)
  const direct = boundary.slice(boundary.indexOf('async function executeBuilderFromConcierge('), boundary.indexOf('async function executeOperationalRepairFromConcierge('))
  assert.doesNotMatch(direct, /await pollBuilderJob\(/)
  assert.match(direct, /return responseFromPayload\(\{[\s\S]*?status: 'running'/)
  assert.match(direct, /recoverBuilderFromHistory/)
  assert.equal((direct.match(/fetchImpl\('\/api\/builder',\s*\{/g) || []).length, 1)
})
