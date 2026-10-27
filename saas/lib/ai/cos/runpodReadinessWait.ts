// saas/lib/ai/cos/runpodReadinessWait.ts
//
// How long a caller may wait for the owned RunPod pod to become ready. Pure, zero imports, so the rule is
// unit-testable without the pod, the lifecycle client or the database.
//
// The shared wake-and-poll loop (runpodPrimaryInference.ts) keeps its own bound: the configured timeout, at least
// 10 s, at most MAX_READY_WAIT_MS. A caller never waits longer than its own call is allowed to run (the cap).
// Production 2026-10-27: the public identity and visual routers (background-labelled, run before COS's planner)
// waited 92–107 s for a cold pod on the first request of every session, unrecorded, leaving the 150 s turn 43 s.

export const MAX_READY_WAIT_MS = 120_000
export const MIN_READY_LOOP_MS = 10_000

export function readinessWaitMs(configTimeoutMs: number, maxWaitMs?: number): number {
  const loop = Math.min(MAX_READY_WAIT_MS, Math.max(MIN_READY_LOOP_MS, configTimeoutMs))
  const cap = Number(maxWaitMs)
  return Number.isFinite(cap) ? Math.max(0, Math.min(loop, Math.floor(cap))) : loop
}
