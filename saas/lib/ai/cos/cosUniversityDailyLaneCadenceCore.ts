// saas/lib/ai/cos/cosUniversityDailyLaneCadenceCore.ts
import type { LearningPathId } from './cosUniversityLearningAssurance.ts'

/**
 * Production-path receipts are scoped to the exact running commit, and main deploys many times a
 * day. A lane scheduled once per day can therefore never hold a receipt for the current commit.
 * These lanes are now invoked hourly, but their academic batch keeps its original once-per-UTC-day
 * window: the batch runs at or after its window only if no successful execution exists for the day.
 * Every other invocation records an honest `not_due` receipt that says the runner was not invoked.
 */
export type CosUniversityDailyLaneWindow = Readonly<{ hourUtc: number; minuteUtc: number }>

export const COS_UNIVERSITY_DAILY_LANE_WINDOWS: Readonly<Partial<Record<LearningPathId, CosUniversityDailyLaneWindow>>> = Object.freeze({
  independent_exams: Object.freeze({ hourUtc: 7, minuteUtc: 0 }),
  subject_a_range_evidence: Object.freeze({ hourUtc: 7, minuteUtc: 10 }),
  language_a_range_evidence: Object.freeze({ hourUtc: 7, minuteUtc: 20 }),
  delayed_retention: Object.freeze({ hourUtc: 7, minuteUtc: 25 }),
  graduation: Object.freeze({ hourUtc: 7, minuteUtc: 30 }),
  masters_admission: Object.freeze({ hourUtc: 7, minuteUtc: 35 }),
  phd_admission: Object.freeze({ hourUtc: 8, minuteUtc: 5 }),
  controlled_fine_tuning: Object.freeze({ hourUtc: 9, minuteUtc: 25 }),
})

export type CosUniversityDailyLaneReceiptRow = Readonly<{
  event_key: string
  observed_at: string
  evidence: Record<string, unknown> | null
}>

export type CosUniversityDailyLaneCadence = Readonly<{
  path: LearningPathId
  due: boolean
  reason: 'before_daily_window' | 'daily_batch_already_executed' | 'daily_batch_due'
  utcDay: string
  windowOpensAt: string
  priorExecutionRef: string | null
  runnerInvoked: boolean
  semantics: 'hourly_receipt_once_per_utc_day_academic_batch'
}>

/** A receipt counts as today's batch only if the runner really executed with the feature on and succeeded. */
export function isCosUniversityDailyBatchExecution(evidence: Record<string, unknown> | null | undefined): boolean {
  if (!evidence) return false
  return evidence.invocationSucceeded === true
    && evidence.featureEnabled === true
    && evidence.dailyCadence !== 'not_due'
    && evidence.skipped !== true
    && evidence.enabled !== false
}

export function decideCosUniversityDailyLaneCadence(input: {
  path: LearningPathId
  now: Date
  rows: readonly CosUniversityDailyLaneReceiptRow[]
}): CosUniversityDailyLaneCadence {
  const window = COS_UNIVERSITY_DAILY_LANE_WINDOWS[input.path]
  if (!window) throw new Error(`not_a_daily_lane:${input.path}`)
  const nowMs = input.now.getTime()
  if (!Number.isFinite(nowMs)) throw new Error('invalid_now')
  const utcDay = input.now.toISOString().slice(0, 10)
  const dayStartMs = Date.parse(`${utcDay}T00:00:00.000Z`)
  const windowOpensMs = dayStartMs + window.hourUtc * 3_600_000 + window.minuteUtc * 60_000
  const windowOpensAt = new Date(windowOpensMs).toISOString()
  const base = { path: input.path, utcDay, windowOpensAt, semantics: 'hourly_receipt_once_per_utc_day_academic_batch' as const }

  if (nowMs < windowOpensMs) {
    return Object.freeze({ ...base, due: false, reason: 'before_daily_window', priorExecutionRef: null, runnerInvoked: false })
  }
  const executed = input.rows
    .filter(row => {
      const at = Date.parse(row.observed_at)
      return Number.isFinite(at) && at >= windowOpensMs && at <= nowMs && isCosUniversityDailyBatchExecution(row.evidence)
    })
    .sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at))[0]
  if (executed) {
    return Object.freeze({
      ...base, due: false, reason: 'daily_batch_already_executed',
      priorExecutionRef: `db://cos_university_learning_assurance_events/${executed.event_key}`, runnerInvoked: false,
    })
  }
  return Object.freeze({ ...base, due: true, reason: 'daily_batch_due', priorExecutionRef: null, runnerInvoked: true })
}
