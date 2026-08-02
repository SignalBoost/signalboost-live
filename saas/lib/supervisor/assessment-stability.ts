// saas/lib/supervisor/assessment-stability.ts
//
// IS THIS CONCLUSION NEW, OR HAS IT BEEN TRUE ALL DAY?
//
// An operator reading "Operational" asks a second question immediately: has it been like
// that, or did it just flip? A state that has held across every retained observation is a
// different thing from one reached thirty seconds ago, and the console was silent on which.
//
// WHAT THIS IS NOT. We do not store past assessments. So this module cannot say "the platform
// has been Operational for 18 hours" — that would be a claim about records we never wrote.
// What it can say, and all it says, is: NO RETAINED OBSERVATION CONTRADICTS THE CURRENT
// CONCLUSION, across N consecutive observations covering a known span of time.
//
// AND WHEN THE STREAK COVERS EVERY RETAINED OBSERVATION, WE SAY "AT LEAST". At that point the
// limit is retention, not stability — the run before the oldest one we kept may well have
// agreed too, and reporting a bounded number as though it were the whole history would quietly
// overstate what the evidence supports. This is the same rule as `unverified` in
// health-severity and `unmeasured` in health-domains: the boundary of what we know is stated,
// not smoothed over.
//
// The caller decides what CONTRADICTS means and must use the same predicate it used to reach
// the conclusion — otherwise the streak and the state can disagree, which is the class of bug
// this whole rebuild exists to remove.
//
// PURE, NO IMPORTS.

export type StabilityObservation = {
  /** ISO timestamp of the observation. */
  at: string
  /** True when this observation is evidence AGAINST the current conclusion. */
  contradicts: boolean
}

export type AssessmentStability = {
  /** Consecutive most-recent observations that do not contradict the conclusion. */
  consecutive: number
  /** The timestamp of the oldest observation in that streak. */
  sinceAt: string | null
  /** Span from that observation to the newest one. */
  durationSeconds: number
  /** A contradicting observation exists somewhere in the retained window. */
  contradicted: boolean
  /** The streak covers every retained observation, so the true figure is "at least" this. */
  windowExhausted: boolean
  /** False when there is no usable observation record — report as not measured, not as stable. */
  measured: boolean
}

const NOT_MEASURED: AssessmentStability = {
  consecutive: 0,
  sinceAt: null,
  durationSeconds: 0,
  contradicted: false,
  windowExhausted: false,
  measured: false,
}

/**
 * How long the current conclusion has gone unchallenged by the evidence we still hold.
 *
 * Observations may arrive in any order; they are sorted newest-first here rather than trusting
 * the caller, because a reversed list would silently produce a streak measured from the wrong
 * end. Entries with unreadable timestamps are dropped — an unusable record must not be counted
 * as either agreement or contradiction.
 */
export function assessStability(observations: StabilityObservation[]): AssessmentStability {
  const usable = observations
    .filter(item => Number.isFinite(Date.parse(item.at)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))

  if (usable.length === 0) return NOT_MEASURED

  let consecutive = 0
  for (const item of usable) {
    if (item.contradicts) break
    consecutive += 1
  }

  if (consecutive === 0) {
    return {
      consecutive: 0,
      sinceAt: usable[0].at,
      durationSeconds: 0,
      contradicted: true,
      windowExhausted: false,
      measured: true,
    }
  }

  const newest = Date.parse(usable[0].at)
  const oldestInStreak = usable[consecutive - 1]
  return {
    consecutive,
    sinceAt: oldestInStreak.at,
    durationSeconds: Math.max(0, Math.round((newest - Date.parse(oldestInStreak.at)) / 1000)),
    contradicted: usable.some(item => item.contradicts),
    windowExhausted: consecutive === usable.length,
    measured: true,
  }
}
