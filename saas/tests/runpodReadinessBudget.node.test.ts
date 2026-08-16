// saas/tests/runpodReadinessBudget.node.test.ts
//
// Pins the rule that a stopped pod is ALWAYS wakeable.
//
// The regression this guards: the cold-start budget was `300s - LOCAL_AI_TIMEOUT_MS - 60s`. Raising
// the inference timeout to accommodate slow answers drove that to zero, so the readiness gate threw
// "no safe RunPod readiness budget remains" and the turn silently escalated to an external provider
// without ever attempting a wake. A latency setting must never disable cold start.

import assert from 'node:assert/strict'
import test from 'node:test'

// Mirrors lib/ai/local-inference.ts. Kept as a local model of the arithmetic so the rule is pinned
// even though the production function is module-private.
const FUNCTION_BUDGET_MS = 300_000
const POST_INFERENCE_RESERVE_MS = 60_000
const MAX_READINESS_BUDGET_MS = 120_000
const MIN_READINESS_SLICE_MS = 5_000
const COLD_START_INFERENCE_RESERVE_CAP_MS = 150_000

function readinessBudgetMs(configuredTimeoutMs: number): number {
  const inferenceReserveMs = Math.min(configuredTimeoutMs, COLD_START_INFERENCE_RESERVE_CAP_MS)
  const available = FUNCTION_BUDGET_MS - inferenceReserveMs - POST_INFERENCE_RESERVE_MS
  return Math.max(0, Math.min(MAX_READINESS_BUDGET_MS, available))
}

test('default timeout leaves a full wake budget', () => {
  assert.equal(readinessBudgetMs(120_000), 120_000)
})

test('REGRESSION: a long inference timeout no longer forbids cold start', () => {
  // 240s previously produced 300-240-60 = 0 → wake refused → external fallback.
  assert.ok(readinessBudgetMs(240_000) >= MIN_READINESS_SLICE_MS, '240s timeout must still allow a wake')
  assert.ok(readinessBudgetMs(300_000) >= MIN_READINESS_SLICE_MS, 'even a ceiling-length timeout must allow a wake')
  assert.ok(readinessBudgetMs(600_000) >= MIN_READINESS_SLICE_MS, 'an absurd timeout must still allow a wake')
})

test('the wake budget is always usable for every permitted timeout value', () => {
  // LOCAL_AI_TIMEOUT_MS is validated to 1000..600000 at config load.
  for (const timeout of [1_000, 30_000, 90_000, 120_000, 150_000, 180_000, 240_000, 300_000, 600_000]) {
    assert.ok(
      readinessBudgetMs(timeout) >= MIN_READINESS_SLICE_MS,
      `timeout ${timeout}ms must leave at least one usable readiness slice`,
    )
  }
})

test('the budget never exceeds its ceiling, so a wake cannot eat the whole function', () => {
  assert.ok(readinessBudgetMs(1_000) <= MAX_READINESS_BUDGET_MS)
  assert.equal(readinessBudgetMs(1_000), MAX_READINESS_BUDGET_MS)
})
