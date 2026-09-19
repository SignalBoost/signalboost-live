// saas/lib/ai/cos/cosUniversityRecoveryDrill.ts
// Deliberate proof that a stopped distillation control loop is detected, repaired and resumed with no
// owner intervention.
//
// Nine passing unit tests already cover the Self-Healing monitor's detection logic, and Production has
// shown it open incidents. What has never been proven end to end is the whole loop against a fault that
// was introduced on purpose: detection, autonomous repair, and the lane actually resuming afterwards.
// Until that is demonstrated, "self-healing" is an assertion about code rather than an observed property
// of the running system.
//
// DESIGN CONSTRAINTS, in the order that decided the design:
//
//  1. A drill must not endanger real work. Disabling a lane outright would strand the artifact backlog,
//     so the drill injects ONE synthetic stalled workflow run - a fault the supervisor is already built
//     to repair - instead of stopping the loop for everything.
//  2. A drill must always clean up after itself. Every plan carries a rollback obligation, and expiry is
//     evaluated BEFORE progress, so a drill that is abandoned mid-flight still ends with the injected
//     fault removed rather than left in the queue.
//  3. A drill must be able to FAIL. Deadlines for detection and repair are part of the record; passing
//     them is a failed drill, not a longer wait.
//  4. A drill must be honest about interference. If the owner or another agent repairs the fault by hand
//     while the drill is running, the run proves nothing about autonomy and the verdict is VOID - never
//     a pass. This module therefore treats any manual actor in the window as disqualifying.
//
// This module is pure: it makes decisions from a drill record plus observed snapshots and events. It
// performs no I/O, holds no credentials, grants no authority, and can neither arm itself nor write
// evidence. The caller owns every side effect.

export type RecoveryDrillFault = 'dispatch_claim_stalled' | 'claimable_stage_stalled'

export type RecoveryDrillRecord = Readonly<{
  drillId: string
  faultKind: RecoveryDrillFault
  /** The synthetic workflow run injected as the fault; the rollback target. */
  injectedRunId: string
  armedAt: string
  /** Hard stop. The fault is rolled back at this point whatever else has happened. */
  expiresAt: string
  detectionDeadlineSeconds: number
  repairDeadlineSeconds: number
}>

export type RecoveryDrillSnapshot = Readonly<{
  checkedAt: string
  /**
   * Deliberately widened: the monitor reports healthy, repair_required, waiting_for_curriculum,
   * budget_paused and authorization_required, and it may gain more. The drill decides from `reasons`
   * alone, so narrowing this to the two states it happens to care about only breaks the caller.
   */
  state: string
  reasons: readonly string[]
}>

/** An action taken against the drill's fault, as recorded by the platform. */
export type RecoveryDrillAction = Readonly<{
  observedAt: string
  /** 'supervisor' is the autonomous loop. Anything else is a human or another agent. */
  actor: 'supervisor' | 'owner' | 'other_agent' | 'unknown'
  kind: 'incident_opened' | 'repair_applied' | 'run_cleared'
  runId: string | null
}>

export type RecoveryDrillPlan =
  | { step: 'await_detection'; secondsRemaining: number }
  | { step: 'await_repair'; secondsRemaining: number }
  | { step: 'await_resume'; secondsRemaining: number }
  | { step: 'rollback_fault'; reason: 'completed' | 'expired' | 'deadline_missed' | 'void' }
  | { step: 'complete' }

export type RecoveryDrillVerdict = Readonly<{
  verdict: 'passed' | 'failed' | 'void' | 'running'
  detectedAfterSeconds: number | null
  repairedAfterSeconds: number | null
  resumedAfterSeconds: number | null
  autonomous: boolean
  reason: string
  rollbackRequired: boolean
}>

export const RECOVERY_DRILL_MAX_TTL_SECONDS = 15 * 60
export const RECOVERY_DRILL_MIN_DETECTION_SECONDS = 60
export const RECOVERY_DRILL_PROFILE = 'cos_university_recovery_drill_v1' as const

function ms(value: string): number {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function seconds(fromIso: string, toMs: number): number | null {
  const from = ms(fromIso)
  if (!Number.isFinite(from)) return null
  return Math.max(0, Math.round((toMs - from) / 1000))
}

/**
 * Reject a malformed or over-long drill before anything is injected. A drill that cannot be bounded is
 * not a drill; it is an outage with a name.
 */
export function assertRecoveryDrillBounded(drill: RecoveryDrillRecord): void {
  const armed = ms(drill.armedAt)
  const expires = ms(drill.expiresAt)
  if (!drill.drillId.trim() || !drill.injectedRunId.trim()) throw new Error('recovery_drill_identity_missing')
  if (!Number.isFinite(armed) || !Number.isFinite(expires)) throw new Error('recovery_drill_window_invalid')
  const ttl = Math.round((expires - armed) / 1000)
  if (ttl <= 0 || ttl > RECOVERY_DRILL_MAX_TTL_SECONDS) throw new Error('recovery_drill_ttl_invalid')
  if (drill.detectionDeadlineSeconds < RECOVERY_DRILL_MIN_DETECTION_SECONDS) throw new Error('recovery_drill_detection_deadline_invalid')
  if (drill.repairDeadlineSeconds <= drill.detectionDeadlineSeconds) throw new Error('recovery_drill_repair_deadline_invalid')
  if (drill.repairDeadlineSeconds > ttl) throw new Error('recovery_drill_deadlines_exceed_ttl')
}

/** Actions taken against this drill's injected run, inside its window, oldest first. */
function ownActions(drill: RecoveryDrillRecord, actions: readonly RecoveryDrillAction[]): RecoveryDrillAction[] {
  const armed = ms(drill.armedAt)
  return actions
    .filter(action => action.runId === drill.injectedRunId && ms(action.observedAt) >= armed)
    .sort((a, b) => ms(a.observedAt) - ms(b.observedAt))
}

function manualInterference(actions: readonly RecoveryDrillAction[]): RecoveryDrillAction | null {
  return actions.find(action => action.actor !== 'supervisor') || null
}

export function evaluateRecoveryDrill(input: {
  drill: RecoveryDrillRecord
  snapshots: readonly RecoveryDrillSnapshot[]
  actions: readonly RecoveryDrillAction[]
  now: Date
}): RecoveryDrillVerdict {
  assertRecoveryDrillBounded(input.drill)
  const nowMs = input.now.getTime()
  const armed = ms(input.drill.armedAt)
  const mine = ownActions(input.drill, input.actions)

  // Interference is checked first: a drill that someone repaired by hand proves nothing about autonomy,
  // and reporting it as a pass would be worse than reporting nothing.
  const manual = manualInterference(mine)
  if (manual) {
    return {
      verdict: 'void',
      detectedAfterSeconds: null,
      repairedAfterSeconds: null,
      resumedAfterSeconds: null,
      autonomous: false,
      reason: `manual_${manual.actor}_${manual.kind}`,
      rollbackRequired: true,
    }
  }

  const ordered = [...input.snapshots]
    .filter(snapshot => Number.isFinite(ms(snapshot.checkedAt)) && ms(snapshot.checkedAt) >= armed)
    .sort((a, b) => ms(a.checkedAt) - ms(b.checkedAt))

  const detected = ordered.find(snapshot => snapshot.reasons.includes(input.drill.faultKind))
  const detectedAfterSeconds = detected ? seconds(input.drill.armedAt, ms(detected.checkedAt)) : null

  const repairAction = detected
    ? mine.find(action => action.kind === 'repair_applied' && ms(action.observedAt) >= ms(detected.checkedAt))
    : undefined
  const repairedAfterSeconds = repairAction ? seconds(input.drill.armedAt, ms(repairAction.observedAt)) : null

  const resumed = repairAction
    ? ordered.find(snapshot => ms(snapshot.checkedAt) >= ms(repairAction.observedAt)
      && !snapshot.reasons.includes(input.drill.faultKind))
    : undefined
  const resumedAfterSeconds = resumed ? seconds(input.drill.armedAt, ms(resumed.checkedAt)) : null

  const elapsed = Math.max(0, Math.round((nowMs - armed) / 1000))

  if (resumedAfterSeconds !== null) {
    return {
      verdict: 'passed',
      detectedAfterSeconds,
      repairedAfterSeconds,
      resumedAfterSeconds,
      autonomous: true,
      reason: 'detected_repaired_resumed_without_intervention',
      rollbackRequired: true,
    }
  }

  if (detectedAfterSeconds === null && elapsed > input.drill.detectionDeadlineSeconds) {
    return {
      verdict: 'failed',
      detectedAfterSeconds: null,
      repairedAfterSeconds: null,
      resumedAfterSeconds: null,
      autonomous: false,
      reason: 'fault_not_detected_within_deadline',
      rollbackRequired: true,
    }
  }

  if (detectedAfterSeconds !== null && repairedAfterSeconds === null && elapsed > input.drill.repairDeadlineSeconds) {
    return {
      verdict: 'failed',
      detectedAfterSeconds,
      repairedAfterSeconds: null,
      resumedAfterSeconds: null,
      autonomous: false,
      reason: 'fault_detected_but_not_repaired_within_deadline',
      rollbackRequired: true,
    }
  }

  if (nowMs >= ms(input.drill.expiresAt)) {
    return {
      verdict: 'failed',
      detectedAfterSeconds,
      repairedAfterSeconds,
      resumedAfterSeconds: null,
      autonomous: false,
      reason: 'drill_expired_before_resume',
      rollbackRequired: true,
    }
  }

  return {
    verdict: 'running',
    detectedAfterSeconds,
    repairedAfterSeconds,
    resumedAfterSeconds: null,
    autonomous: false,
    reason: detectedAfterSeconds === null ? 'awaiting_detection'
      : repairedAfterSeconds === null ? 'awaiting_repair'
      : 'awaiting_resume',
    rollbackRequired: false,
  }
}

/**
 * The next action the caller should take. Expiry is evaluated before progress so an abandoned drill is
 * always cleaned up, and a terminal verdict always yields a rollback before completion.
 */
export function planRecoveryDrill(input: {
  drill: RecoveryDrillRecord
  snapshots: readonly RecoveryDrillSnapshot[]
  actions: readonly RecoveryDrillAction[]
  now: Date
  faultRolledBack: boolean
}): RecoveryDrillPlan {
  const verdict = evaluateRecoveryDrill(input)
  if (verdict.verdict !== 'running') {
    if (!input.faultRolledBack) {
      return {
        step: 'rollback_fault',
        reason: verdict.verdict === 'void' ? 'void'
          : verdict.verdict === 'passed' ? 'completed'
          : verdict.reason === 'drill_expired_before_resume' ? 'expired'
          : 'deadline_missed',
      }
    }
    return { step: 'complete' }
  }
  const nowMs = input.now.getTime()
  const remaining = Math.max(0, Math.round((ms(input.drill.expiresAt) - nowMs) / 1000))
  if (verdict.detectedAfterSeconds === null) return { step: 'await_detection', secondsRemaining: remaining }
  if (verdict.repairedAfterSeconds === null) return { step: 'await_repair', secondsRemaining: remaining }
  return { step: 'await_resume', secondsRemaining: remaining }
}
