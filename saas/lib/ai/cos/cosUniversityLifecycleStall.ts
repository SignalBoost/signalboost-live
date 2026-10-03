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
//
// Owner, 2026-10-02: the graces below are now the assembly line's own station SLAs rather than numbers chosen here,
// so the watcher and the controller can never disagree about when a station has stopped.
import { stationById } from './cosUniversityAssemblyLine.ts'

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
 * Grace per stage: material present and NOTHING moved for this long.
 *
 * Owner, 2026-10-02, rule 4: "If material is waiting but a station produces no output, orchestration detects that in
 * minutes and acts. It doesn't wait until a 30/45/60-minute artifact timeout before noticing the line stopped."
 *
 * These were 100-180 minutes, chosen as "several of the stage's own cron cycles". That was the wrong unit: it is a
 * LINE-STOP alarm, so it should fire roughly one unit of work plus two of the station's own ticks after the station
 * last produced anything. Each value below is now the matching station's `stationSlaSeconds` from the line
 * definition, which is the single place those cadences and work windows live.
 *
 *   exam          INDEPENDENT_EVALUATION. Lane runs every odd minute, 12 minutes of work per unit.
 *   quarantine    QUARANTINE_REMEDIATION. Batched at :13/:28/:43/:58, so two missed ticks is already a stop. The 6h
 *                 stall limit inside the resolution is a DIFFERENT clock - how long ONE student may wait - and is
 *                 unaffected by this.
 *   registration  GRADUATION. Registry writes, batched, cron every 10 minutes.
 *   activation    GRADUATION's station SLA plus the serial RunPod wait each activation really costs
 *                 (GRADUATE_RUNTIME_READY_WAIT_MS of 4 minutes plus the 10-minute canary-active window), because one
 *                 activation pins one of the ten account-wide workers and genuinely cannot be parallelised.
 */
const stationSla = (id: string, fallbackSeconds: number): number => {
  const station = stationById(id)
  return station && station.stationSlaSeconds > 0 ? station.stationSlaSeconds : fallbackSeconds
}

export const LIFECYCLE_STAGE_GRACE_SECONDS: Readonly<Record<LifecycleStageId, number>> = Object.freeze({
  exam: stationSla('INDEPENDENT_EVALUATION', 25 * 60),
  quarantine: stationSla('QUARANTINE_REMEDIATION', 35 * 60),
  registration: stationSla('GRADUATION', 25 * 60),
  activation: stationSla('GRADUATION', 25 * 60) + 14 * 60,
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