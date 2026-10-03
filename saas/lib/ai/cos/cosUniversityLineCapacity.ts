// Shared deployment capacity; no provider calls, spend or promotion authority.
/** The one number a deployment declares. Everything else is arithmetic. */
export const INFERENCE_WORKERS_ENV = 'COS_UNIVERSITY_INFERENCE_WORKERS' as const
/** Optional override for how much of the pool is held for graduates serving production work. */
export const WORKFORCE_RESERVE_ENV = 'COS_UNIVERSITY_WORKFORCE_RESERVE_WORKERS' as const

/** Used only when neither existing capacity setting contains a positive integer. */
export const DEFAULT_INFERENCE_WORKERS = 10

/** Below this nothing can run at all: one canary, one evaluator, one graduate, one slot of headroom. */
export const MINIMUM_INFERENCE_WORKERS = 4
export const MAXIMUM_INFERENCE_WORKERS = 100_000

/** Shares of the pool. They sum to less than 1 on purpose: the remainder is headroom. */
const WORKFORCE_SHARE = 0.25
const CANARY_SHARE = 0.4
const EVALUATION_SHARE = 0.5

/** A canary occupies its worker for about this long end to end, including a cold start. */
export const CANARY_CYCLE_SECONDS = 10 * 60
/** An independent evaluation occupies its worker for about this long. */
export const EVALUATION_CYCLE_SECONDS = 12 * 60

export type LineCapacity = Readonly<{
  /** Total concurrent inference workers this deployment declares. */
  workers: number
  /** Which existing setting supplied the resolved worker pool. */
  source: 'override' | 'quota' | 'fallback'
  /** Workers held for graduates serving real production work. Never zero. */
  workforce: number
  /** Concurrent exact-artifact canaries. */
  canary: number
  /** Concurrent independent evaluations. */
  evaluation: number
  /** Concurrent graduate activations. Bounded by the workforce reserve, since each activation pins a worker. */
  activation: number
  /** Canary approvals per rolling hour, derived from concurrency and the canary's own cycle time. */
  canaryApprovalsPerHour: number
  /** Independent-evaluation approvals per rolling hour. */
  evaluationApprovalsPerHour: number
  /** Exam sets the writer prepares per tick. Kept ahead of the canary so admission is never starved. */
  examSetsPerTick: number
  /** Registry writes per tick. No worker is involved, so this is bounded only by the batch size. */
  registrationsPerTick: number
  /** Workers deliberately left unreserved, so a canary or a graduate can always start. Never zero. */
  headroom: number
  /** Finished artifacts per hour this capacity can carry, at the slowest station. */
  artifactsPerHour: number
  authorityExpanded: false
}>

const positiveInt = (raw: unknown): number | null => {
  const value = String(raw ?? '').trim()
  if (!/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

/** Single capacity resolver used by provisioning, scheduling and telemetry. */
export function declaredInferenceWorkers(env: Record<string, string | undefined> = process.env): {
  workers: number
  source: LineCapacity['source']
} {
  const override = positiveInt(env[INFERENCE_WORKERS_ENV])
  const quota = positiveInt(env.RUNPOD_SERVERLESS_WORKER_QUOTA)
  const workers = override ?? quota ?? DEFAULT_INFERENCE_WORKERS
  // Never invent workers to make the station arithmetic fit a smaller pool.
  if (workers < MINIMUM_INFERENCE_WORKERS || workers > MAXIMUM_INFERENCE_WORKERS) {
    throw new Error(`university_inference_worker_capacity_out_of_range:${workers}`)
  }
  return { workers, source: override !== null ? 'override' : quota !== null ? 'quota' : 'fallback' }
}

/**
 * Pure: derive every station's capacity from the declared worker pool.
 *
 * The invariant that makes this safe to raise: canary + evaluation + workforce is always STRICTLY less than the
 * pool, so there is always at least one unreserved worker. That is the rule the old hardcoded numbers were
 * protecting by hand ("preserve one unreserved worker of headroom"), and it is now arithmetic rather than a comment.
 */
export function lineCapacity(env: Record<string, string | undefined> = process.env): LineCapacity {
  const { workers, source } = declaredInferenceWorkers(env)

  const reserveOverride = positiveInt(env[WORKFORCE_RESERVE_ENV])
  // Leave at least three workers for the line itself, whatever the override asks for.
  const workforce = Math.max(1, Math.min(reserveOverride ?? Math.floor(workers * WORKFORCE_SHARE), workers - 3))

  const forTheLine = workers - workforce
  let canary = Math.max(1, Math.floor(forTheLine * CANARY_SHARE))
  let evaluation = Math.max(1, Math.floor(forTheLine * EVALUATION_SHARE))
  // Enforce the headroom invariant by arithmetic, not by hoping the shares add up.
  while (canary + evaluation >= forTheLine && canary + evaluation > 2) {
    if (evaluation > canary) evaluation -= 1
    else canary -= 1
  }
  const headroom = Math.max(1, forTheLine - canary - evaluation)

  const canaryApprovalsPerHour = Math.max(1, Math.floor(canary * (3600 / CANARY_CYCLE_SECONDS)))
  const evaluationApprovalsPerHour = Math.max(1, Math.floor(evaluation * (3600 / EVALUATION_CYCLE_SECONDS)))

  return Object.freeze({
    workers,
    source,
    workforce,
    canary,
    evaluation,
    activation: Math.max(1, Math.floor(workforce / 2)),
    canaryApprovalsPerHour,
    evaluationApprovalsPerHour,
    // The exam writer uses no inference worker of its own - it makes small teacher calls - so it is kept
    // comfortably ahead of the canary. A canary that waits on an exam set is the line stop of 2026-10-03.
    examSetsPerTick: Math.max(10, canary * 4),
    // A registry write touches no worker at all, so there is no reason to serialize it.
    registrationsPerTick: Math.max(10, canary * 4),
    headroom,
    // The line finishes a unit no faster than its slowest station.
    artifactsPerHour: Math.min(canaryApprovalsPerHour, evaluationApprovalsPerHour),
    authorityExpanded: false as const,
  })
}

/** One line for a log or a dashboard: what this deployment's line can actually do. */
export function describeLineCapacity(capacity: LineCapacity): string {
  return `${capacity.workers} inference workers (${capacity.source}): `
    + `${capacity.canary} canary, ${capacity.evaluation} evaluation, ${capacity.activation} activation, `
    + `${capacity.workforce} workforce, ${capacity.headroom} headroom `
    + `-> ~${capacity.artifactsPerHour} artifacts/hour`
}
