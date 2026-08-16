// saas/lib/ai/cos/cosTurnBudget.ts
//
// WALL-CLOCK BUDGET FOR ONE COS TURN.
//
// A single local turn can chain several 32B round-trips: council advisory (members concurrent),
// council challenge round, the main answer, an optional quality-repair pass and an optional
// skill-citation repair pass. Each is bounded individually, but nothing bounded the SUM — so a
// slow run measured ~233s against a 300s platform ceiling, and a slightly slower one returns
// nothing at all because the function is killed mid-flight.
//
// The fix is not to delete reasoning phases (that trades quality for speed on every turn). It is
// to make the OPTIONAL phases deadline-aware: run them while there is comfortably time, skip them
// when there is not, and always return the answer COS already has. A slightly less polished answer
// beats a killed request.
//
// Deterministic and dependency-free so it can be unit-tested without clocks or models.

/** Platform ceiling for the COS answer routes (`export const maxDuration = 300`). */
const PLATFORM_CEILING_MS = 300_000

/**
 * Headroom reserved for everything that is NOT model inference: retrieval, persistence,
 * provenance writes, experience recording and serialising the response. Optional phases are
 * skipped early enough that these always complete.
 */
const RESERVED_OVERHEAD_MS = 45_000

export type TurnBudget = {
  startedAt: number
  deadlineAt: number
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

/** Total wall clock one turn may spend before optional work must stop. */
export function turnBudgetMs(): number {
  const configured = positiveInt(process.env.COS_TURN_BUDGET_MS, PLATFORM_CEILING_MS - RESERVED_OVERHEAD_MS)
  // Never allow configuration to exceed the platform ceiling minus overhead — that would restore
  // the exact failure this module exists to prevent.
  return Math.min(configured, PLATFORM_CEILING_MS - RESERVED_OVERHEAD_MS)
}

export function startTurnBudget(now = Date.now()): TurnBudget {
  return { startedAt: now, deadlineAt: now + turnBudgetMs() }
}

export function remainingMs(budget: TurnBudget, now = Date.now()): number {
  return Math.max(0, budget.deadlineAt - now)
}

/**
 * Whether an optional phase expected to cost roughly `estimatedMs` should run.
 *
 * Conservative by design: a phase runs only when the remaining budget covers its estimate, so a
 * phase that overruns its estimate still leaves the reserved overhead intact.
 */
export function hasBudgetFor(budget: TurnBudget, estimatedMs: number, now = Date.now()): boolean {
  return remainingMs(budget, now) >= Math.max(0, estimatedMs)
}

/**
 * Typical cost of one local 32B round-trip, used as the estimate for optional single-call phases
 * (quality repair, citation repair). Configurable because it is hardware-dependent: an A40 serving
 * qwen2.5-coder:32b is not the same as a buyer's H100.
 */
export function localCallEstimateMs(): number {
  return positiveInt(process.env.COS_LOCAL_CALL_ESTIMATE_MS, 75_000)
}

/**
 * The challenge round issues a challenge and a rebuttal per pair. Pairs run concurrently, so the
 * expected cost is roughly two sequential calls regardless of pair count.
 */
export function challengeRoundEstimateMs(): number {
  return positiveInt(process.env.COS_COUNCIL_CHALLENGE_ESTIMATE_MS, localCallEstimateMs() * 2)
}
