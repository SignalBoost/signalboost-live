// saas/lib/ai/cos/cosUniversityStudySupplyPriority.ts
/**
 * Selection pressure for the bounded study-plan slots, derived from what acquisition actually
 * returned rather than from admission thresholds. No confidence, relevance or source floor is
 * touched here: a barren gap is one whose sources keep handing back documents that the unchanged
 * gates then reject.
 *
 * The University lane plans far more than it can study — production runs show 13 planned, 4 eligible
 * — so the slots are the scarce resource. When the same gaps occupy them every cycle while their
 * feeds return the same already-seen pool, productive gaps never get a turn. This orders exhausted
 * gaps last so the slots go to gaps that can still yield, and it never removes a gap: a feed that
 * refreshes tomorrow is picked up as soon as the barren streak is broken or the slots are free.
 */

/** One gap's outcome in a single completed acquisition cycle. */
export type StudyGapCycleOutcome = Readonly<{
  documentsAcquired: number
  accepted: number
}>

/** Most-recent-first history per gap id, as recorded in cos_university_continuous_runs.gap_diagnostics. */
export type StudyGapHistory = ReadonlyMap<string, readonly StudyGapCycleOutcome[]>

export const DEFAULT_BARREN_STREAK_THRESHOLD = 4

function asOutcome(value: unknown): StudyGapCycleOutcome | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const documentsAcquired = Number(row.documentsAcquired)
  const accepted = Number(row.accepted)
  if (!Number.isFinite(documentsAcquired) || !Number.isFinite(accepted)) return null
  return { documentsAcquired: Math.max(0, documentsAcquired), accepted: Math.max(0, accepted) }
}

/**
 * Builds per-gap history from the newest-first gap_diagnostics objects of recent runs.
 * Rows the runner never reached contribute nothing, so a skipped cycle cannot fake a barren streak.
 */
export function studyGapHistoryFromDiagnostics(runs: readonly unknown[]): StudyGapHistory {
  const history = new Map<string, StudyGapCycleOutcome[]>()
  for (const run of runs) {
    if (!run || typeof run !== 'object' || Array.isArray(run)) continue
    for (const [gapId, raw] of Object.entries(run as Record<string, unknown>)) {
      const outcome = asOutcome(raw)
      if (!outcome) continue
      const existing = history.get(gapId)
      if (existing) existing.push(outcome)
      else history.set(gapId, [outcome])
    }
  }
  return history
}

/**
 * Consecutive most-recent cycles in which the gap acquired documents and accepted none.
 * A cycle that acquired nothing at all is a source outage, not an exhausted pool, and breaks nothing:
 * it is skipped rather than counted, so a dead adapter cannot push a healthy gap into cooldown.
 */
export function barrenStreak(outcomes: readonly StudyGapCycleOutcome[] | undefined): number {
  if (!outcomes?.length) return 0
  let streak = 0
  for (const outcome of outcomes) {
    if (outcome.accepted > 0) break
    if (outcome.documentsAcquired > 0) streak += 1
  }
  return streak
}

export type StudyGapCandidate = Readonly<{ planKey: string }>

/** Gap ids embed the plan key (`auto-gap:university:<planKey>:<capability>`). */
export function planBarrenStreak(planKey: string, history: StudyGapHistory): number {
  const key = String(planKey || '').trim()
  if (!key) return 0
  let worst = 0
  for (const [gapId, outcomes] of history) {
    if (!gapId.includes(key)) continue
    worst = Math.max(worst, barrenStreak(outcomes))
  }
  return worst
}

/**
 * Stable partition: plans whose pool looks exhausted move to the back, original order preserved
 * within each group. Callers still slice their own limit, so an exhausted plan is only displaced
 * while a productive one is waiting — if every plan is barren the order is unchanged and study
 * proceeds exactly as before.
 */
export function orderStudyPlansBySupply<T extends StudyGapCandidate>(
  plans: readonly T[],
  history: StudyGapHistory,
  threshold = DEFAULT_BARREN_STREAK_THRESHOLD,
): T[] {
  const limit = Math.max(1, Math.floor(threshold))
  const productive: T[] = []
  const exhausted: T[] = []
  for (const plan of plans) {
    if (planBarrenStreak(plan.planKey, history) >= limit) exhausted.push(plan)
    else productive.push(plan)
  }
  return [...productive, ...exhausted]
}
