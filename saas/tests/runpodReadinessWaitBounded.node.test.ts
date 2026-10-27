// saas/tests/runpodReadinessWaitBounded.node.test.ts
//
// A MODEL CALL NEVER WAITS FOR THE OWNED POD LONGER THAN IT MAY RUN. Production 2026-10-27, four turns: the public
// identity and visual routers (feature cos_routing_classifier, so background-labelled) run before COS's planner and
// waited 92–107 s for a cold RunPod pod on the first request of every session (1 s on the next), unrecorded, leaving
// the 150 s turn 43 s for everything else. The wake-and-poll loop is shared and keeps running for the next caller;
// each caller stops waiting at its own bound.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { readinessWaitMs } from '../lib/ai/cos/runpodReadinessWait.ts'
import { callTimeBoundMs, USER_ANSWER_TIMEOUT_MS } from '../lib/ai/local-inference.ts'
import { runWithTurnDeadline, USER_ANSWER_WINDOW_MS } from '../lib/ai/cos/cosTurnBudget.ts'

test('the shared loop keeps its own bound; a caller cap only tightens it', () => {
  assert.equal(readinessWaitMs(120_000), 120_000)
  assert.equal(readinessWaitMs(300_000), 120_000)
  assert.equal(readinessWaitMs(5_000), 10_000, 'the loop always polls at least 10 s')
  assert.equal(readinessWaitMs(120_000, 2_500), 2_500)
  assert.equal(readinessWaitMs(120_000, 0), 0)
  assert.equal(readinessWaitMs(120_000, -5), 0)
  assert.equal(readinessWaitMs(120_000, 500_000), 120_000)
  assert.equal(readinessWaitMs(120_000, Number.NaN), 120_000)
})

test('a call\'s time bound is its own window, tightened by its caller and by the turn', async () => {
  const config = { baseUrl: 'https://pod.invalid/v1', model: 'qwen3:30b', provider: 'runpod', routeOwner: 'itmounts', timeoutMs: 120_000 } as const
  const router = { prompt: 'x', timeoutMs: 2_500, usageContext: { feature: 'cos_routing_classifier', purpose: 'public_identity' } } as never
  const background = { prompt: 'x', usageContext: { feature: 'builder_graduate' } } as never
  const answer = { prompt: 'x', writesUserAnswer: true, usageContext: { feature: 'cos_interactive_answer', purpose: 'user_facing_response' } } as never
  // Outside a turn: the router waits at most its own 2.5 s; a durable background call keeps its configured 120 s.
  assert.equal(callTimeBoundMs(router, config as never), 2_500)
  assert.equal(callTimeBoundMs(background, config as never), 120_000)
  assert.equal(callTimeBoundMs(answer, config as never), USER_ANSWER_TIMEOUT_MS)
  const now = Date.now()
  await runWithTurnDeadline(now + 150_000, async () => {
    assert.equal(callTimeBoundMs(router, config as never), 2_500)
    // A helper with no surplus (the answer window reserved) may not wait at all.
    const late = { ...(router as object), timeoutMs: 8_000 } as never
    assert.ok(callTimeBoundMs(late, config as never) <= 30_000)
    assert.ok(callTimeBoundMs(answer, config as never) <= USER_ANSWER_TIMEOUT_MS)
  }, { answerReserveMs: USER_ANSWER_WINDOW_MS })
})

test('both RunPod paths pass the call bound as the wake cap, and the background wait is a recorded stage', () => {
  const inference = readFileSync(new URL('../lib/ai/local-inference.ts', import.meta.url), 'utf8')
  assert.match(inference, /resolveRunpodPrimaryConfigForChat\('reasoner', \{ maxWaitMs: callTimeBoundMs\(args, config\) \}\)/)
  assert.match(inference, /resolveReadyRunpodPrimaryConfig\('reasoner', \{ maxWaitMs: callTimeBoundMs\(args, effectiveConfig\) \}\)/)
  assert.match(inference, /recordCosLatencyStage\('runpod:ready_wait', Date\.now\(\) - readyWaitStartedAt\)/)
  const primary = readFileSync(new URL('../lib/ai/cos/runpodPrimaryInference.ts', import.meta.url), 'utf8')
  // The shared proof is reset when IT finishes, not when a racing caller stops waiting.
  assert.match(primary, /readinessPromise = startReadinessProof\(workload, podId, config\)\.finally\(\(\) => \{ readinessPromise = null \}\)/)
  assert.match(primary, /return await Promise\.race\(\[readinessPromise, expired\]\)/)
  assert.match(primary, /const ready = await proveReady\(workload, podId, options\.maxWaitMs\)/)
})
