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
//
// WHOLE-TURN DEADLINE (Sep 21 2026). startTurnBudget() used to start a fresh clock on every call,
// and several stages (COS-first, semantic rescue, completion rescue, fresh-evidence synthesis) each
// call the reasoner. The per-call budgets therefore stacked until the durable worker hit the 300 s
// platform ceiling and was killed (History: worker_lost). The durable worker now opens ONE deadline
// for the whole turn with runWithTurnDeadline(); every budget started inside it is clamped to that
// deadline, and every model HTTP call (lib/ai/local-inference.ts) is clamped to the time left.

import { AsyncLocalStorage } from 'node:async_hooks'

/** Platform ceiling for the COS answer routes (`export const maxDuration = 300`). */
const PLATFORM_CEILING_MS = 300_000

/**
 * Headroom reserved for everything that is NOT model inference: retrieval, persistence,
 * provenance writes, experience recording and serialising the response. Optional phases are
 * skipped early enough that these always complete.
 */
const RESERVED_OVERHEAD_MS = 45_000
const DEFAULT_INTERACTIVE_TURN_BUDGET_MS = 45_000

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
  const configured = positiveInt(process.env.COS_TURN_BUDGET_MS, DEFAULT_INTERACTIVE_TURN_BUDGET_MS)
  // Never allow configuration to exceed the platform ceiling minus overhead — that would restore
  // the exact failure this module exists to prevent.
  return Math.min(configured, PLATFORM_CEILING_MS - RESERVED_OVERHEAD_MS)
}

const turnDeadlineScope = new AsyncLocalStorage<{ deadlineAt: number }>()

/**
 * Run one whole COS turn under a single wall-clock deadline. Nested scopes can only tighten it.
 * Everything awaited inside fn (reasoner phases, rescues, model HTTP calls) sees the same deadline.
 */
export function runWithTurnDeadline<T>(deadlineAt: number, fn: () => Promise<T>): Promise<T> {
  const outer = turnDeadlineScope.getStore()
  const effective = outer ? Math.min(outer.deadlineAt, deadlineAt) : deadlineAt
  return turnDeadlineScope.run({ deadlineAt: effective }, fn)
}

/**
 * Run durable work that must NOT inherit an interactive COS turn deadline.
 * Next.js `after()` snapshots every AsyncLocalStorage context, so a Builder job queued from a
 * Concierge/COS turn otherwise keeps that turn's wall clock: the owned RunPod attempt is cut off
 * when the turn expires and the paid fallback is then issued with ~0 ms left and fails before any
 * HTTP response. Durable jobs carry their own Platform Harness deadline instead.
 */
export function runWithoutTurnDeadline<T>(fn: () => Promise<T>): Promise<T> {
  return turnDeadlineScope.exit(fn)
}

/** Milliseconds left in the enclosing whole-turn deadline, or null when no turn deadline is open. */
export function turnDeadlineRemainingMs(now = Date.now()): number | null {
  const scope = turnDeadlineScope.getStore()
  return scope ? Math.max(0, scope.deadlineAt - now) : null
}

export function startTurnBudget(now = Date.now()): TurnBudget {
  const own = now + turnBudgetMs()
  const scope = turnDeadlineScope.getStore()
  return { startedAt: now, deadlineAt: scope ? Math.min(own, scope.deadlineAt) : own }
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
