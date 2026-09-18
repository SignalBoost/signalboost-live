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
  | 'expected_running'
  | 'expected_gated'
  | 'expected_absent'
  | 'undeclared'

export type CosUniversityLaneStatus =
  | 'running_as_expected'
  | 'idle_no_eligible_work'
  | 'gated_as_expected'
  | 'absent_as_expected'
  | 'unexpectedly_disabled'
  | 'unexpectedly_dark'
  | 'unexpectedly_enabled'
  | 'undeclared'

type PathProgram = Readonly<{ level: CosUniversityProgramLevel; terminal: boolean }>

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

const ACTIVE_TIMING: ReadonlySet<CosUniversityProgramTimingStatus> = new Set([
  'minimum_residence', 'on_schedule', 'target_date_passed',
])

export type CosUniversityLaneExpectationInput = Readonly<{
  path: LearningPathId
  timingByLevel: Readonly<Partial<Record<CosUniversityProgramLevel, CosUniversityProgramTimingStatus>>>
  terminalPrerequisiteMet?: boolean
}>

/**
 * These lanes are governed by candidate/runtime evidence rather than an academic program calendar.
 * When idle or waiting on a prerequisite they are correctly gated, not undeclared or dark.
 */
const CALENDAR_NEUTRAL_PATHS: ReadonlySet<string> = new Set([
  'controlled_fine_tuning',
])

/**
 * Operational controllers remain expected to report even when they have no eligible work. Their
 * no-work receipt is classified as idle, while a missing/disabled controller remains visible.
 */
const OPERATIONAL_IDLE_OK_PATHS: ReadonlySet<string> = new Set([
  'distilled_independent_evaluation',
  'mass_distilled_independent_evaluation',
  'mass_distillation_campaign',
  'mass_distillation_supervision',
  'graduate_runtime_activation',
])

export function cosUniversityLaneExpectation(
  input: CosUniversityLaneExpectationInput,
): CosUniversityLaneExpectation {
  if (OPERATIONAL_IDLE_OK_PATHS.has(String(input.path))) return 'expected_running'
  if (CALENDAR_NEUTRAL_PATHS.has(String(input.path))) return 'expected_gated'
  const program = PATH_PROGRAMS[input.path]
  if (!program) return 'undeclared'

  const timing = input.timingByLevel[program.level]
  if (!timing || timing === 'not_enrolled' || timing === 'deadline_expired') return 'expected_absent'
  if (!ACTIVE_TIMING.has(timing)) return 'expected_absent'

  if (!program.terminal) return 'expected_running'
  return input.terminalPrerequisiteMet === true ? 'expected_running' : 'expected_gated'
}

export type CosUniversityLaneObservation = Readonly<{
  path: LearningPathId
  receiptFound: boolean
  featureEnabled: boolean
  verified: boolean
  executionBlocker?: string | null
}>

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

  if (!observation.receiptFound) return 'unexpectedly_dark'
  if (!observation.featureEnabled) return 'unexpectedly_disabled'
  if (observation.verified) return 'running_as_expected'
  if (String(observation.executionBlocker || '') === 'runner_not_invoked') return 'idle_no_eligible_work'
  return 'unexpectedly_dark'
}

export function cosUniversityLaneStatusIsFault(status: CosUniversityLaneStatus): boolean {
  return status === 'unexpectedly_disabled'
    || status === 'unexpectedly_dark'
    || status === 'unexpectedly_enabled'
    || status === 'undeclared'
}
