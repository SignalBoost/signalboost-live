// saas/lib/ai/cos/cosUniversityLineCapacity.ts
//
// How wide the University assembly line is, from a single source of truth.
//
// Owner, 2026-10-03: "the defect is two sources of truth: COS_UNIVERSITY_INFERENCE_WORKERS (256 default) vs
// RUNPOD_SERVERLESS_WORKER_QUOTA (10 default). Fix this by declaring worker capacity once, with fallback = 10,
// matching the provisioner. Telemetry must report the exact source (override / quota / fallback)."
//
// The defect was mine, shipped earlier the same day. The provisioning code already declared the pool -
// `process.env.RUNPOD_SERVERLESS_WORKER_QUOTA || '10'`, read in three places across runpodMassDistilledProvision.ts
// and runpodMassDistilledProvisionV2.ts - and this module invented a parallel variable defaulting to 256. The
// provisioner believed it had ten workers while the line sized itself for two hundred and fifty-six: one fact, two
// answers, disagreeing by 25x.
//
// The fix is ONE resolution order, applied in ONE function, with the winner named in telemetry:
//
//   1. COS_UNIVERSITY_INFERENCE_WORKERS   university_override   a deployment that gives the University only part of
//                                                               its pool says so here, and it wins outright
//   2. RUNPOD_SERVERLESS_WORKER_QUOTA     runpod_quota          otherwise the pool is whatever the deployment
//                                                               already told the provisioner it has
//   3. (nothing declared)                 undeclared_fallback   10, matching the provisioner's own fallback exactly,
//                                                               so the two halves can never contradict each other
//
// No new variable is introduced: both names already exist in the codebase. What changed is that they are no longer
// two competing defaults - there is one order of precedence, one fallback, and the resolution is reported.
//
// This is not a throttle on the product. The line is as wide as the infrastructure the buyer DECLARES: a Fortune 500
// deployment that declares 256 workers gets a 256-worker line from that single change, because the provisioner and
// the line read the same number. The fallback is 10 only because sizing the line to a pool the provisioner does not
// believe in is precisely the contradiction being removed.
//
// Nothing here grades, promotes or authorizes spend. It answers one question: how wide are the pipes on THIS
// deployment's declared infrastructure.

/** University-specific override. Wins outright when set. */
export const INFERENCE_WORKERS_ENV = 'COS_UNIVERSITY_INFERENCE_WORKERS' as const
/** The deployment's serverless worker pool. The provisioner reads this same variable. */
export const WORKER_QUOTA_ENV = 'RUNPOD_SERVERLESS_WORKER_QUOTA' as const

/**
 * What an undeclared deployment gets, matching `RUNPOD_SERVERLESS_WORKER_QUOTA || '10'` in the provisioner exactly.
 *
 * Not a judgement about how big a line should be - the only honest answer when nothing has been declared is to size
 * the line to the same pool the provisioner is about to size its endpoints against.
 */
export const UNDECLARED_WORKER_FALLBACK = 10

/** Below this nothing can run: one canary, one evaluator, one graduate, one slot of headroom. */
export const MINIMUM_WORKER_POOL = 4
export const MAXIMUM_WORKER_POOL = 100_000

/** Shares of the pool. They sum to less than 1 on purpose: the remainder is headroom. */
const WORKFORCE_SHARE = 0.25
const CANARY_SHARE = 0.4
const EVALUATION_SHARE = 0.5

/** A canary occupies its worker for about this long end to end, including a cold start. */
const CANARY_CYCLE_SECONDS = 10 * 60
/** An independent evaluation occupies its worker for about this long. */
const EVALUATION_CYCLE_SECONDS = 12 * 60

/** Which declaration won. Reported in telemetry so a line width is always traceable to its cause. */
export type WorkerPoolSource = 'university_override' | 'runpod_quota' | 'undeclared_fallback'

export type WorkerPoolResolution = Readonly<{
  workers: number
  /** True when any declaration was found; false means the fallback is in force. */
  declared: boolean
  source: WorkerPoolSource
  /** The exact variable that produced `workers`, or null when nothing was declared. */
  sourceEnv: typeof INFERENCE_WORKERS_ENV | typeof WORKER_QUOTA_ENV | null
  /** True when both variables were set and the override won, so a contradiction is visible rather than silent. */
  contradicted: boolean
}>

export type LineCapacity = WorkerPoolResolution & Readonly<{
  /** Workers held for graduates serving real production work. Never zero. */
  workforce: number
  /** Concurrent exact-artifact canaries. */
  canary: number
  /** Concurrent independent evaluations. */
  evaluation: number
  /** Concurrent graduate activations, bounded by the workforce reserve since each activation pins a worker. */
  activation: number
  /** Canary approvals per rolling hour, derived from concurrency and the canary's own cycle time. */
  canaryApprovalsPerHour: number
  /** Independent-evaluation approvals per rolling hour. */
  evaluationApprovalsPerHour: number
  /** Exam sets the writer prepares per tick, kept ahead of the canary so admission is never starved. */
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

/**
 * The ONE resolution of worker capacity. Every station is sized from this and nothing else reads the environment.
 *
 * An unusable value (zero, negative, fractional, non-numeric) is treated as not declared rather than guessed at, so
 * a typo degrades to the provisioner's fallback instead of silently resizing the line.
 */
export function declaredInferenceWorkers(env: Record<string, string | undefined> = process.env): WorkerPoolResolution {
  const clamp = (value: number) => Math.min(MAXIMUM_WORKER_POOL, Math.max(MINIMUM_WORKER_POOL, value))
  const override = positiveInt(env[INFERENCE_WORKERS_ENV])
  const quota = positiveInt(env[WORKER_QUOTA_ENV])

  if (override !== null) {
    return Object.freeze({
      workers: clamp(override),
      declared: true,
      source: 'university_override',
      sourceEnv: INFERENCE_WORKERS_ENV,
      // Both were set. The override wins, and the disagreement is reported rather than hidden.
      contradicted: quota !== null,
    })
  }
  if (quota !== null) {
    return Object.freeze({
      workers: clamp(quota),
      declared: true,
      source: 'runpod_quota',
      sourceEnv: WORKER_QUOTA_ENV,
      contradicted: false,
    })
  }
  return Object.freeze({
    workers: clamp(UNDECLARED_WORKER_FALLBACK),
    declared: false,
    source: 'undeclared_fallback',
    sourceEnv: null,
    contradicted: false,
  })
}

/**
 * Pure: derive every station's capacity from the resolved worker pool.
 *
 * The invariant that makes this safe to raise: canary + evaluation + workforce is always STRICTLY less than the
 * pool, so there is always at least one unreserved worker. That is the rule the old hardcoded numbers protected by
 * hand ("preserve one unreserved worker of headroom"), and it is arithmetic now rather than a comment.
 */
export function lineCapacity(env: Record<string, string | undefined> = process.env): LineCapacity {
  const pool = declaredInferenceWorkers(env)
  const workers = pool.workers

  // Leave at least three workers for the line itself, whatever the share arithmetic produces.
  const workforce = Math.max(1, Math.min(Math.floor(workers * WORKFORCE_SHARE), workers - 3))

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
    ...pool,
    workforce,
    canary,
    evaluation,
    activation: Math.max(1, Math.floor(workforce / 2)),
    canaryApprovalsPerHour,
    evaluationApprovalsPerHour,
    // The exam writer uses no inference worker of its own - it makes small teacher calls - so it is kept
    // comfortably ahead of the canary. A canary waiting on an exam set is the line stop of 2026-10-03.
    examSetsPerTick: Math.max(10, canary * 4),
    // A registry write touches no worker at all, so there is no reason to serialize it.
    registrationsPerTick: Math.max(10, canary * 4),
    headroom,
    // The line finishes a unit no faster than its slowest station.
    artifactsPerHour: Math.min(canaryApprovalsPerHour, evaluationApprovalsPerHour),
    authorityExpanded: false as const,
  })
}

/**
 * Telemetry: the resolved pool, the exact variable that produced it, and every derived station.
 *
 * Owner 2026-10-03: "telemetry must be precise and match the code exactly, like a doctor's thermometer." Every
 * figure below is read straight off the same object the stations are sized from, so a reader can never be shown a
 * number the line is not actually running. A contradiction between the two declarations is stated, not hidden.
 */
export function describeLineCapacity(capacity: LineCapacity): string {
  const origin = capacity.source === 'university_override'
    ? `source=university_override (${INFERENCE_WORKERS_ENV})${capacity.contradicted ? ` overriding ${WORKER_QUOTA_ENV}` : ''}`
    : capacity.source === 'runpod_quota'
      ? `source=runpod_quota (${WORKER_QUOTA_ENV})`
      : `source=undeclared_fallback (${UNDECLARED_WORKER_FALLBACK}, matching the provisioner; set ${WORKER_QUOTA_ENV} to declare)`
  return `workers=${capacity.workers} ${origin} | `
    + `canary=${capacity.canary} evaluation=${capacity.evaluation} activation=${capacity.activation} `
    + `workforce=${capacity.workforce} headroom=${capacity.headroom} | `
    + `canaryApprovalsPerHour=${capacity.canaryApprovalsPerHour} examSetsPerTick=${capacity.examSetsPerTick} `
    + `artifactsPerHour=${capacity.artifactsPerHour}`
}
// end of saas/lib/ai/cos/cosUniversityLineCapacity.ts (if this line is missing, the paste was cut short)
