//
// Owner, 2026-10-03: "MY PLATFORM IS A TEST ENVIRONMENT - WE ARE BUILDING THIS FOR COMPANIES WITH FINANCIAL
// RESOURCES SO BUILD A FERRARI NOT A LADA."
//
// He is right, and the line had his test rig's limits welded into it. Every throughput number in the University
// pipeline was a rationing scheme for ONE fact, recorded verbatim in the evaluation authority:
//
//     "RunPod's account-wide serverless worker quota is 10. With three live evaluators, one active graduate and
//      other account serverless reservations, the exact-artifact canary lane reached 10/10 before provider
//      invocation."
//
// Ten workers. That is why the canary allowed 12 approvals an hour, the evaluator ran 2 at a time, activation moved
// one graduate per tick, and the exam writer prepared 10 sets per tick. None of those numbers describe the work; they
// describe a small account. A buyer with resources runs hundreds of workers or their own GPU cluster, and would hit
// that ceiling on their first afternoon - in a product whose whole premise is that the BUYER brings the infrastructure.
//
// So capacity stops being a constant and becomes a declared property of the deployment. There is ONE input - how many
// concurrent inference workers this deployment can run - and every station's limit is derived from it. The default is
// enterprise scale. A small test rig declares its real size and gets small numbers automatically.
//
// Nothing here grades, promotes or authorizes spend. It answers one question: how wide are the pipes on THIS
// deployment's infrastructure.

/** The one number a deployment declares. Everything else is arithmetic. */
export const INFERENCE_WORKERS_ENV = 'COS_UNIVERSITY_INFERENCE_WORKERS' as const
/** Optional override for how much of the pool is held for graduates serving production work. */
export const WORKFORCE_RESERVE_ENV = 'COS_UNIVERSITY_WORKFORCE_RESERVE_WORKERS' as const

/**
 * Enterprise default: a buyer who declares nothing gets a line built for a company with resources.
 *
 * This is deliberately NOT the safe-for-a-tiny-account number. A portable that ships throttled to its author's
 * hobby quota is the Lada. A deployment that really has ten workers says so, in one environment variable.
 */
export const ENTERPRISE_INFERENCE_WORKERS = 256

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
  /** True when the deployment declared its own size; false means the enterprise default is in force. */
  declared: boolean
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

/** How many concurrent inference workers this deployment declares, clamped to a sane range. */
export function declaredInferenceWorkers(env: Record<string, string | undefined> = process.env): {
  workers: number
  declared: boolean
} {
  const raw = positiveInt(env[INFERENCE_WORKERS_ENV])
  if (raw === null) return { workers: ENTERPRISE_INFERENCE_WORKERS, declared: false }
  return {
    workers: Math.min(MAXIMUM_INFERENCE_WORKERS, Math.max(MINIMUM_INFERENCE_WORKERS, raw)),
    declared: true,
  }
}

/**
 * Pure: derive every station's capacity from the declared worker pool.
 *
 * The invariant that makes this safe to raise: canary + evaluation + workforce is always STRICTLY less than the
 * pool, so there is always at least one unreserved worker. That is the rule the old hardcoded numbers were
 * protecting by hand ("preserve one unreserved worker of headroom"), and it is now arithmetic rather than a comment.
 */
export function lineCapacity(env: Record<string, string | undefined> = process.env): LineCapacity {
  const { workers, declared } = declaredInferenceWorkers(env)

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
    declared,
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
  const source = capacity.declared ? 'declared' : `default (set ${INFERENCE_WORKERS_ENV} to declare)`
  return `${capacity.workers} inference workers ${source}: `
    + `${capacity.canary} canary, ${capacity.evaluation} evaluation, ${capacity.activation} activation, `
    + `${capacity.workforce} workforce, ${capacity.headroom} headroom `
    + `-> ~${capacity.artifactsPerHour} artifacts/hour`
}
