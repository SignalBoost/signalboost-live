// saas/tests/builderRunpodSharedHealth.node.test.ts
//
// Production 2026-10-14 (OrderFlow job 4eb4a2e5, provider_inference_usage): 80 of 98 Builder RunPod calls timed out
// (49 x ~52s, 31 x ~17.5s) with no output; the configured fallback then answered 31 calls in ~8s each. The breaker that
// should skip a failing RunPod lived in one serverless instance's memory, so every new instance probed RunPod again.
// RunPod health is now read from the recorded usage rows that all instances share.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { BUILDER_RUNPOD_HEALTH_WINDOW_MS, builderRunpodRowsTimedOut, builderRunpodRowsTooSlow } from '../lib/ai/localInferenceUsage.ts'

const timeout = (reason = 'timeout:inference_transport_deadline') => ({ success: false, finish_reason: reason })

test('two most recent Builder RunPod timeouts open the shared breaker', () => {
  assert.equal(builderRunpodRowsTimedOut([timeout(), timeout('timeout:inference_owner_deadline')]), true)
})

test('a recent success, a busy skip, or a single timeout keeps RunPod in use', () => {
  assert.equal(builderRunpodRowsTimedOut([{ success: true, finish_reason: 'stop' }, timeout()]), false, 'newest call succeeded')
  assert.equal(builderRunpodRowsTimedOut([timeout(), { success: true, finish_reason: 'stop' }]), false)
  assert.equal(builderRunpodRowsTimedOut([{ success: false, finish_reason: 'runpod_busy_background_work' }, timeout()]), false, 'busy is not ill health')
  assert.equal(builderRunpodRowsTimedOut([timeout()]), false, 'one timeout is not a pattern')
  assert.equal(builderRunpodRowsTimedOut([]), false, 'no recent calls: probe RunPod again')
})

test('the health read is shared, bounded to two minutes, and never blocks RunPod when unreadable', () => {
  const usage = readFileSync(new URL('../lib/ai/localInferenceUsage.ts', import.meta.url), 'utf8')
  const reader = usage.slice(usage.indexOf('export async function builderRunpodRecentlyTimingOut'))
  assert.equal(BUILDER_RUNPOD_HEALTH_WINDOW_MS, 120_000)
  assert.match(reader, /\.from\('provider_inference_usage'\)/)
  assert.match(reader, /\.eq\('feature', 'builder_runpod_primary'\)/)
  assert.match(reader, /\.gte\('created_at', new Date\(nowMs - BUILDER_RUNPOD_HEALTH_WINDOW_MS\)\.toISOString\(\)\)/)
  assert.match(reader, /\.order\('created_at', \{ ascending: false \}\)\.limit\(2\)/)
  assert.match(reader, /if \(error \|\| !data\) return false/)
})

test('an open breaker skips RunPod and goes straight to the fallback a timeout would reach', () => {
  const port = readFileSync(new URL('../lib/cos/aiPort.ts', import.meta.url), 'utf8')
  const builder = port.slice(port.indexOf('export function createBuilderCodingAiPort('), port.indexOf('export function createLocalApplianceAiPort('))
  assert.match(builder, /primaryInCooldown\s*\?\s*\{ text: null, attempted: false, reason: 'builder_runpod_circuit_open' \}/)
  assert.ok(builder.indexOf('builderRunpodRecentlyTimingOut()') < builder.indexOf('await tryRunpodPrimaryInference('))
  assert.ok(builder.indexOf('await tryRunpodPrimaryInference(') < builder.indexOf('await tryAssignedPlatformModelTurn('), 'fallback order unchanged')
  assert.doesNotMatch(builder, /let builderRunpod|builderRunpodBlockedUntil/, 'no per-instance breaker state remains')
})
// end of saas/tests/builderRunpodSharedHealth.node.test.ts (if this line is missing, the paste was cut short)

test('two measured slow successful replies trigger temporary owned-provider cooldown', () => {
  const slow = { success: true, completion_tokens: 48, latency_ms: 8300 }
  const fast = { success: true, completion_tokens: 48, latency_ms: 1000 }
  assert.equal(builderRunpodRowsTooSlow([slow, slow]), true)
  assert.equal(builderRunpodRowsTooSlow([slow, fast]), false)
  assert.equal(builderRunpodRowsTooSlow([slow]), false)
  assert.equal(builderRunpodRowsTooSlow([{ success: true, completion_tokens: 5, latency_ms: 10000 }, slow]), false)
  assert.equal(builderRunpodRowsTooSlow([{ success: true, completion_tokens: null, latency_ms: 10000 }, slow]), false)
  assert.equal(builderRunpodRowsTooSlow([{ success: false, completion_tokens: 48, latency_ms: 8300 }, slow]), false)
})
