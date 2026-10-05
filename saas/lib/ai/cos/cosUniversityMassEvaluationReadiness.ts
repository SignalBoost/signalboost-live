// saas/lib/ai/cos/cosUniversityMassEvaluationReadiness.ts
//
// Pure readiness evidence for the mass-distilled evaluator (no I/O, safe for the plain `node --test` gate).
//
// Production 2026-10-04 03:24 -> 2026-10-05 02:56 UTC: 62 evaluations across 47 artifacts failed as
// runtime_not_ready:mass_distilled_gateway_ping_timeout - the full 280s readiness window passed without the exact
// artifact's gateway answering /ping 200. The evaluator polls RunPod's control-plane health every 3s during that
// window and then discarded what it saw, so the failure could not say which of three different causes it was:
//   cold          - RunPod never reported a worker for the endpoint (GPU supply / worker quota)
//   initializing  - a worker was being started but never became running (image pull / model load too slow)
//   warm          - a worker was running/ready/idle but the gateway never answered 200 (in-container load/gateway)
// `unknown` means no health read succeeded in the whole window. The furthest stage observed is reported, as one fixed
// word, so identical failures keep producing identical error strings.

export type ReadinessWorkerStage = 'unknown' | 'cold' | 'initializing' | 'warm'

const ORDER: Readonly<Record<ReadinessWorkerStage, number>> = Object.freeze({ unknown: 0, cold: 1, initializing: 2, warm: 3 })

type WorkerCounts = Readonly<{ ready?: unknown; running?: unknown; idle?: unknown; initializing?: unknown }>

/** The stage one successful control-plane health read shows. */
export function readinessWorkerStage(workers: WorkerCounts | null | undefined): ReadinessWorkerStage {
  const count = (value: unknown) => Math.max(0, Number(value) || 0)
  if (!workers) return 'unknown'
  if (count(workers.ready) + count(workers.running) + count(workers.idle) > 0) return 'warm'
  if (count(workers.initializing) > 0) return 'initializing'
  return 'cold'
}

/** The further of two stages: a worker that was seen running stays `warm` even if it later scaled away. */
export function furthestReadinessWorkerStage(seen: ReadinessWorkerStage, next: ReadinessWorkerStage): ReadinessWorkerStage {
  return ORDER[next] > ORDER[seen] ? next : seen
}

// end of saas/lib/ai/cos/cosUniversityMassEvaluationReadiness.ts (if this line is missing, the paste was cut short)
