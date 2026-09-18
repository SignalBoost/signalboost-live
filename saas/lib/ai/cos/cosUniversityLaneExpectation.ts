// saas/lib/ai/cos/cosUniversityLaneExpectation.ts
/**
 * The production verification board reports each academic path as verified or not. It cannot say
 * WHY a path is unverified, because three very different situations produce the identical shape:
 *
 *   - `graduation` is switched off on purpose; minimum residence has not elapsed.
 *   - `independent_exams` was switched off by accident; the lane silently stopped executing.
 *   - `delayed_retention` is switched on and idle, because no eligible work exists yet.
 *
 * On 2026-09-13 the second case sat in `missingOrInvalid` next to the first for hours and looked
 * exactly as unremarkable. Twelve graded exam runs had been produced the previous day, then none;
 * nothing observed the difference, and three downstream lanes (subject A-range, language A-range,
 * delayed retention) were left waiting on unseen passes that could no longer be produced.
 *
 * This module supplies the missing half: what SHOULD be running. Expectation is derived from the
 * enrollment calendar the runners themselves obey — `cosUniversityProgramTimingStatus` — never from
 * a hand-maintained list that would drift away from it. A path this module does not recognise is
 * reported as `undeclared` rather than assumed healthy, so adding a lane without declaring its
 * expectation is visible instead of silent.
 *
 * A fourth situation was found on the first sweep after this module shipped: a lane with no receipt
 * yet on a fresh build. `featureEnabled` comes out of receipt evidence, so an absent receipt reads
 * as `false` and looked identical to a flag switched off. Seven lanes were filed as accidentally
 * disabled minutes after a deploy, before their crons were due. An observation now carries
 * `receiptFound`, and no claim about a flag is made where no receipt reported one.
 *
 * Nothing here writes evidence, changes a flag, or influences a grade. It classifies observations.
 */

import type { LearningPathId } from './cosUniversityLearningAssurance.ts'
import type { CosUniversityProgramLevel, CosUniversityProgramTimingStatus } from './cosUniversityPrograms.ts'

/** When a lane is supposed to be executing, expressed independently of what it is actually doing. */
export type CosUniversityLaneExpectation =
  /** An active program requires this lane to run now. Silence is an incident. */
  | 'expected_running'
  /** Correctly withheld — the calendar or a prerequisite has not been reached yet. */
  | 'expected_gated'
  /** No program at this level exists, so the lane has nothing to do and owes no receipt. */
  | 'expected_absent'
  /** The path has no declared expectation. Never treated as healthy. */
  | 'undeclared'

export type CosUniversityLaneStatus =
  | 'running_as_expected'
  | 'idle_no_eligible_work'
  | 'gated_as_expected'
  | 'absent_as_expected'
  /**
   * Expected to run, and a receipt for this build reported its feature flag OFF. This is the
   * accidental-shutdown case, and it is only claimable when a receipt actually said so.
   */
  | 'unexpectedly_disabled'
  /**
   * Expected to run, but this build holds no usable receipt for the lane — either none at all, or
   * one that ran and failed. The flag state is unreported, so no claim is made about it.
   */
  | 'unexpectedly_dark'
  /** Deliberately gated, yet enabled. Staging drift rather than an outage. */
  | 'unexpectedly_enabled'
  | 'undeclared'

/** Which program level a path belongs to, and whether it is terminal (awards or admits). */
type PathProgram = Readonly<{ level: CosUniversityProgramLevel; terminal: boolean }>

/**
 * Terminal paths are the ones that must NOT run during minimum residence: they issue credentials or
 * admit into the next program. Every other path is ordinary coursework and runs throughout.
 */
const PATH_PROGRAMS: Readonly<Partial<Record<LearningPathId, PathProgram>>> = Object.freeze({
  registered_agent_cycle: { level: 'undergraduate', terminal: false },
  continuous_learning: { level: 'undergraduate', terminal: false },
  deliberate_practice: { level: 'undergraduate', terminal: false },
  independent_exams: { level: 'undergraduate', terminal: false },
  subject_a_range_evidence: { level: 'undergraduate', terminal: false },
  language_a_range_evidence: { level: 'undergraduate', terminal: false },
  delayed_retention: { level: 'undergraduate', terminal: false },
  graduation: { level: 'undergraduate', terminal: true },
  masters_admission: { level: 'masters', terminal: true },
  masters_learning: { level: 'masters', terminal: false },
  masters_exams: { level: 'masters', terminal: false },
  masters_progress: { level: 'masters', terminal: false },
  phd_admission: { level: 'phd', terminal: true },
  phd_runtime: { level: 'phd', terminal: false },
  phd_progress: { level: 'phd', terminal: false },
  phd_research: { level: 'phd', terminal: false },
  phd_methodology_exams: { level: 'phd', terminal: false },
})

/** Timing values under which coursework is genuinely expected to be executing. */
const ACTIVE_TIMING: ReadonlySet<CosUniversityProgramTimingStatus> = new Set([
  'minimum_residence', 'on_schedule', 'target_date_passed',
])

export type CosUniversityLaneExpectationInput = Readonly<{
  path: LearningPathId
  /** Timing per level, from `cosUniversityProgramTimingStatus` on that level's enrollment. */
  timingByLevel: Readonly<Partial<Record<CosUniversityProgramLevel, CosUniversityProgramTimingStatus>>>
  /**
   * True when the prerequisite for a terminal path is satisfied — residence elapsed for graduation,
   * a prior credential held for admission. Supplied by the caller from durable records; this module
   * never infers a credential.
   */
  terminalPrerequisiteMet?: boolean
}>

/**
 * `controlled_fine_tuning` is deliberately excluded from PATH_PROGRAMS: it belongs to no program
 * calendar and only ever runs on an approved candidate, so it is expectation-neutral and reported
 * as gated rather than dark when idle.
 */
const CALENDAR_NEUTRAL_PATHS: ReadonlySet<string> = new Set(['controlled_fine_tuning'])

export function cosUniversityLaneExpectation(
  input: CosUniversityLaneExpectationInput,
): CosUniversityLaneExpectation {
  if (CALENDAR_NEUTRAL_PATHS.has(String(input.path))) return 'expected_gated'
  const program = PATH_PROGRAMS[input.path]
  if (!program) return 'undeclared'

  const timing = input.timingByLevel[program.level]
  if (!timing || timing === 'not_enrolled' || timing === 'deadline_expired') return 'expected_absent'
  if (!ACTIVE_TIMING.has(timing)) return 'expected_absent'

  if (!program.terminal) return 'expected_running'
  // A terminal path waits for its prerequisite. Residence still running is the ordinary reason.
  return input.terminalPrerequisiteMet === true ? 'expected_running' : 'expected_gated'
}

export type CosUniversityLaneObservation = Readonly<{
  path: LearningPathId
  /**
   * Whether a receipt for the current commit was found for this lane. Required, because
   * `featureEnabled` is read out of receipt evidence and NEVER out of the environment: with no
   * receipt it is false by absence, which says nothing about the flag. On 2026-09-13 a fresh
   * deployment reported all eighteen lanes `featureEnabled: false` for that reason alone, and
   * seven were filed as accidentally disabled before any cron had had a chance to fire.
   */
  receiptFound: boolean
  featureEnabled: boolean
  verified: boolean
  /** From the verification board. `runner_not_invoked` means it ran and had nothing eligible. */
  executionBlocker?: string | null
}>

/**
 * Combine what should be happening with what is, into one status a human or an alert can act on.
 * The only statuses that represent a fault are `unexpectedly_disabled`, `unexpectedly_dark`,
 * `unexpectedly_enabled` and `undeclared`.
 */
export function classifyCosUniversityLane(
  expectation: CosUniversityLaneExpectation,
  observation: CosUniversityLaneObservation,
): CosUniversityLaneStatus {
  if (expectation === 'undeclared') return 'undeclared'
  if (expectation === 'expected_absent') return 'absent_as_expected'

  if (expectation === 'expected_gated') {
    return observation.receiptFound && observation.featureEnabled && observation.verified
      ? 'unexpectedly_enabled' : 'gated_as_expected'
  }

  // Absent evidence is not evidence of a flag. A lane whose cron has not yet fired on this build
  // is dark — the honest reading — rather than disabled, which would accuse the environment.
  if (!observation.receiptFound) return 'unexpectedly_dark'
  if (!observation.featureEnabled) return 'unexpectedly_disabled'
  if (observation.verified) return 'running_as_expected'
  // The lane executed and declined for want of eligible work. Not a fault; it clears on its own.
  if (String(observation.executionBlocker || '') === 'runner_not_invoked') return 'idle_no_eligible_work'
  return 'unexpectedly_dark'
}

/** True when the status requires attention rather than patience. */
export function cosUniversityLaneStatusIsFault(status: CosUniversityLaneStatus): boolean {
  return status === 'unexpectedly_disabled'
    || status === 'unexpectedly_dark'
    || status === 'unexpectedly_enabled'
    || status === 'undeclared'
}
