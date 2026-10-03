// saas/lib/ai/cos/cosUniversityLifecycleStall.ts
//
// Owner, 2026-10-02: "place/attach orchestration into the process so the life cycle keeps going", and then, correctly:
// "if exist, it is not orchestrating very well."
//
// The distillation supervisor runs every 5 minutes and already remediates, but every reason it can raise is UPSTREAM
// of the artifact existing - heartbeat, campaigns, dispatch claims, provider jobs, curriculum packaging, budget.
// Nothing in it describes what happens to a student AFTER it is trained. That is why four separate parkings went
// unnoticed for days while the heartbeat stayed green:
//
//   the exam lane idled on no_mass_artifact_with_holdout_exam_ready while finished exams sat unreachable
//   11 students sat in quarantine with two outcomes that never changed a status
//   registration starved its oldest artifact of its own verdict and reported the wrong one
//   passing artifacts waited at runtime_pending with no registry row
//
// This module is the missing half: it watches each downstream stage for WORK PRESENT AND NOT MOVING. It is pure and
// decides nothing about quality - it cannot pass, fail, promote or dismiss a student. It reports that a stage holding
// work has produced no transition for longer than its own cadence allows, so the existing governed supervisor can
// raise it like any other incident.
//
// A stage with no work is silent, never "stalled": an empty queue is the pipeline working, not a fault.

/** One downstream stage of the student lifecycle, measured by its own cadence. */
export type LifecycleStageId =
  | 'exam'
  | 'quarantine'
  | 'registration'
  | 'activation'

export type LifecycleStageReading = Readonly<{
  stage: LifecycleStageId
  /** Students currently held by this stage. Zero means nothing to do, which is never a stall. */
  waiting: number
  /** Newest transition OUT of this stage, ISO-8601. Null when the stage has never moved anything. */
  lastTransitionAt: string | null
  /** Oldest arrival still held, ISO-8601. Used only when the stage has never moved anything. */
  oldestWaitingSince: string | null
}>

export type LifecycleStall = Readonly<{
  stage: LifecycleStageId
  waiting: number
  /** How long the stage has held work without moving any of it, in seconds. */
  idleSeconds: number
  graceSeconds: number
  reason: LifecycleStallReason
}>

export type LifecycleStallReason =
  | 'lifecycle_exam_stalled'
  | 'lifecycle_quarantine_stalled'
  | 'lifecycle_registration_stalled'
  | 'lifecycle_activation_stalled'

/**
 * Grace per stage, derived from the cron that drives it, with room for a slow tick and a cold start.
 *
 *   exam         evaluation lane runs every odd minute; the writer fills at :04/:14/... Ten exam-writer
 *                cycles is ample for at least one student to move.
 *   quarantine   resolution runs at :13/:28/:43/:58. The 6h stall limit inside the resolution is a DIFFERENT
 *                clock (how long one student may wait); this is "the stage moved nobody at all".
 *   registration graduate-activation cron runs at :07/:17/... and registers one per tick.
 *   activation   same cron, and activation is gated by its own owner flag, so it gets the longest grace.
 */
export const LIFECYCLE_STAGE_GRACE_SECONDS: Readonly<Record<LifecycleStageId, number>> = Object.freeze({
  exam: 100 * 60,
  quarantine: 90 * 60,
  registration: 90 * 60,
  activation: 180 * 60,
})

const STAGE_REASON: Readonly<Record<LifecycleStageId, LifecycleStallReason>> = Object.freeze({
  exam: 'lifecycle_exam_stalled',
  quarantine: 'lifecycle_quarantine_stalled',
  registration: 'lifecycle_registration_stalled',
  activation: 'lifecycle_activation_stalled',
})

const parsed = (value: string | null | undefined): number | null => {
  if (!value) return null
  const at = Date.parse(String(value))
  return Number.isFinite(at) ? at : null
}

/**
 * Pure: which downstream stages are holding work and not moving it.
 *
 * A stage is stalled only when it holds at least one student AND the most recent evidence of movement is older than
 * its grace. When a stage has never moved anything, the oldest student's arrival is the clock instead, so a lane that
 * was born broken is caught rather than treated as "no evidence, no fault". A stage whose timestamps are unreadable
 * is NOT reported: an unreadable clock is a reason to look, never evidence that the pipeline stopped.
 */
export function decideUniversityLifecycleStalls(input: {
  stages: readonly LifecycleStageReading[]
  now: Date
}): readonly LifecycleStall[] {
  const nowMs = input.now instanceof Date ? input.now.getTime() : Number.NaN
  if (!Number.isFinite(nowMs)) return Object.freeze([])

  const stalls: LifecycleStall[] = []
  for (const reading of input.stages) {
    const grace = LIFECYCLE_STAGE_GRACE_SECONDS[reading.stage]
    if (!grace) continue
    const waiting = Math.floor(Number(reading.waiting))
    // An empty stage is the pipeline working.
    if (!Number.isFinite(waiting) || waiting <= 0) continue

    const movedAt = parsed(reading.lastTransitionAt) ?? parsed(reading.oldestWaitingSince)
    // No readable clock at all: report nothing rather than invent a stall.
    if (movedAt === null) continue
    const idleSeconds = Math.floor((nowMs - movedAt) / 1000)
    // A clock in the future is skew, not movement, and not a stall either.
    if (idleSeconds <= grace) continue

    stalls.push(Object.freeze({
      stage: reading.stage,
      waiting,
      idleSeconds,
      graceSeconds: grace,
      reason: STAGE_REASON[reading.stage],
    }))
  }
  return Object.freeze(stalls)
}

/** Every reason this module can raise, for the supervisor's reason union and its critical list. */
export const LIFECYCLE_STALL_REASONS: readonly LifecycleStallReason[] = Object.freeze([
  'lifecycle_exam_stalled',
  'lifecycle_quarantine_stalled',
  'lifecycle_registration_stalled',
  'lifecycle_activation_stalled',
])
// end of saas/lib/ai/cos/cosUniversityLifecycleStall.ts (if this line is missing, the paste was cut short)
