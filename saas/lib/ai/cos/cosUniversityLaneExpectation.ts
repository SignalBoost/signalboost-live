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
// saas/lib/ai/cos/cosUniversityProductionVerification.ts
import { cosServiceDb } from '../../cos-core/storage/supabase.ts'
import {
  evaluateCosUniversityProductionVerification,
  UNIVERSITY_PRODUCTION_PATHS,
  type ProductionPathEventRow,
} from './cosUniversityProductionVerificationCore.ts'
import {
  classifyCosUniversityLane,
  cosUniversityLaneExpectation,
  cosUniversityLaneStatusIsFault,
  type CosUniversityLaneStatus,
} from './cosUniversityLaneExpectation.ts'
import {
  cosUniversityProgramMayGraduate,
  cosUniversityProgramTimingStatus,
  type CosUniversityProgramEnrollment,
  type CosUniversityProgramLevel,
  type CosUniversityProgramTimingStatus,
} from './cosUniversityPrograms.ts'

const UNDERGRADUATE_PROGRAM_KEY = 'generalist_undergraduate_v1'
const DEFAULT_AGENT_ID = 'cos'

type EnrollmentRow = {
  program_key: string
  program_level: CosUniversityProgramLevel
  enrolled_at: string
  minimum_residence_until: string
  target_completion_at: string
  hard_deadline_at: string
}

function mapEnrollment(row: EnrollmentRow): CosUniversityProgramEnrollment & { programLevel: CosUniversityProgramLevel } {
  return {
    programKey: row.program_key,
    programLevel: row.program_level,
    enrolledAt: row.enrolled_at,
    minimumResidenceUntil: row.minimum_residence_until,
    targetCompletionAt: row.target_completion_at,
    hardDeadlineAt: row.hard_deadline_at,
  }
}

/**
 * What the calendar says SHOULD be happening, read from the same enrollment rows the cron gates
 * read. A lane's expectation is never hand-declared, so it cannot drift away from the runners.
 */
async function readLaneExpectationContext(agentId: string, now: Date): Promise<{
  timingByLevel: Partial<Record<CosUniversityProgramLevel, CosUniversityProgramTimingStatus>>
  terminalPrerequisiteMet: Partial<Record<string, boolean>>
  contextAvailable: boolean
}> {
  const db = cosServiceDb()
  if (!db) return { timingByLevel: {}, terminalPrerequisiteMet: {}, contextAvailable: false }

  const [enrollmentResult, credentialResult] = await Promise.all([
    db.from('cos_university_program_enrollments')
      .select('program_key,program_level,enrolled_at,minimum_residence_until,target_completion_at,hard_deadline_at')
      .eq('agent_id', agentId)
      .order('enrolled_at', { ascending: false }),
    db.from('cos_university_credentials').select('program_key').eq('agent_id', agentId),
  ])
  if (enrollmentResult.error) throw enrollmentResult.error
  if (credentialResult.error) throw credentialResult.error

  const enrollments = ((enrollmentResult.data || []) as EnrollmentRow[]).map(mapEnrollment)
  const credentials = new Set(((credentialResult.data || []) as Array<{ program_key: string }>).map(row => row.program_key))

  const timingByLevel: Partial<Record<CosUniversityProgramLevel, CosUniversityProgramTimingStatus>> = {}
  for (const enrollment of enrollments) {
    // Newest enrollment per level wins; the query is already ordered newest-first.
    if (timingByLevel[enrollment.programLevel]) continue
    timingByLevel[enrollment.programLevel] = cosUniversityProgramTimingStatus(enrollment, now)
  }

  const undergraduate = enrollments.find(row => row.programKey === UNDERGRADUATE_PROGRAM_KEY) ?? null
  const terminalPrerequisiteMet: Partial<Record<string, boolean>> = {
    // Graduation may run only once residence has elapsed and the cohort is still inside its deadline.
    graduation: cosUniversityProgramMayGraduate(undergraduate, now),
    // Admission into a program requires the prior credential actually issued, never inferred.
    masters_admission: credentials.has(UNDERGRADUATE_PROGRAM_KEY),
    phd_admission: [...credentials].some(key => key.includes('masters')),
  }

  return { timingByLevel, terminalPrerequisiteMet, contextAvailable: true }
}

export async function readCosUniversityProductionVerification(now = new Date(), agentId = DEFAULT_AGENT_ID) {
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || ''
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || ''
  const production = process.env.VERCEL_ENV === 'production'
  if (!production || !deploymentId || !commitSha) return {
    production, deploymentId, commitSha, verified: false,
    missingOrInvalid: UNIVERSITY_PRODUCTION_PATHS,
    paths: [],
    faults: [],
    expectationContextAvailable: false,
    semantics: 'exact_production_commit_and_deployment_receipts_required',
  }
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_learning_assurance_events')
    .select('event_key,path_id,deployment_id,commit_sha,evidence,verifier,observed_at,expires_at')
    .eq('event_type', 'production_path')
    .eq('commit_sha', commitSha)
    .order('observed_at', { ascending: false })
    .limit(500)
  if (result.error) throw result.error

  const evaluated = evaluateCosUniversityProductionVerification({
    deploymentId, commitSha, now, rows: (result.data || []) as ProductionPathEventRow[],
  })

  // A path can be unverified for three unrelated reasons, and the board alone cannot tell them
  // apart. Classify each against the calendar so a lane that went dark is distinguishable from one
  // that is correctly gated or simply has no eligible work yet.
  const context = await readLaneExpectationContext(agentId, now)
  const paths = evaluated.paths.map(path => {
    const expectation = cosUniversityLaneExpectation({
      path: path.path,
      timingByLevel: context.timingByLevel,
      terminalPrerequisiteMet: context.terminalPrerequisiteMet[path.path] === true,
    })
    const laneStatus: CosUniversityLaneStatus = classifyCosUniversityLane(expectation, {
      path: path.path,
      // Without a receipt on this commit the flag was never reported, so `featureEnabled` below is
      // false by absence. The classifier needs both facts to avoid inventing a shutdown.
      receiptFound: path.receiptFound === true,
      featureEnabled: path.featureEnabled === true,
      verified: path.verified === true,
      executionBlocker: path.executionBlocker ?? null,
    })
    return { ...path, expectation, laneStatus }
  })

  const faults = paths
    .filter(path => cosUniversityLaneStatusIsFault(path.laneStatus))
    .map(path => ({ path: path.path, laneStatus: path.laneStatus, featureFlag: path.featureFlag }))

  return {
    production, deploymentId, commitSha,
    ...evaluated,
    paths,
    faults,
    expectationContextAvailable: context.contextAvailable,
    semantics: 'exact_production_commit_and_deployment_receipts_required',
  }
}
// saas/tests/cosUniversityLaneExpectation.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cosUniversityLaneExpectation,
  classifyCosUniversityLane,
  cosUniversityLaneStatusIsFault,
} from '../lib/ai/cos/cosUniversityLaneExpectation.ts'

/** Undergraduate residence is still running; no Master's or PhD enrollment exists. */
const RESIDENCE = { undergraduate: 'minimum_residence' } as const

test('the exact production incident: a receipt reporting the flag off is a fault, not an absence', () => {
  const expectation = cosUniversityLaneExpectation({ path: 'independent_exams', timingByLevel: RESIDENCE })
  assert.equal(expectation, 'expected_running')
  const status = classifyCosUniversityLane(expectation, {
    path: 'independent_exams', receiptFound: true, featureEnabled: false, verified: false,
    executionBlocker: 'execution_evidence_missing',
  })
  assert.equal(status, 'unexpectedly_disabled')
  assert.equal(cosUniversityLaneStatusIsFault(status), true)
})

test('graduation off during residence is correct and raises nothing', () => {
  const expectation = cosUniversityLaneExpectation({
    path: 'graduation', timingByLevel: RESIDENCE, terminalPrerequisiteMet: false,
  })
  assert.equal(expectation, 'expected_gated')
  const status = classifyCosUniversityLane(expectation, {
    path: 'graduation', receiptFound: false, featureEnabled: false, verified: false,
    executionBlocker: 'execution_evidence_missing',
  })
  assert.equal(status, 'gated_as_expected')
  assert.equal(cosUniversityLaneStatusIsFault(status), false)
})

test('graduation and exams were indistinguishable on the board; they are not here', () => {
  const exams = classifyCosUniversityLane(
    cosUniversityLaneExpectation({ path: 'independent_exams', timingByLevel: RESIDENCE }),
    { path: 'independent_exams', receiptFound: true, featureEnabled: false, verified: false },
  )
  const graduation = classifyCosUniversityLane(
    cosUniversityLaneExpectation({ path: 'graduation', timingByLevel: RESIDENCE }),
    { path: 'graduation', receiptFound: true, featureEnabled: false, verified: false },
  )
  assert.notEqual(exams, graduation)
})

test('an enabled lane that produced no receipt is dark, separately from being disabled', () => {
  const status = classifyCosUniversityLane('expected_running', {
    path: 'continuous_learning', receiptFound: true, featureEnabled: true, verified: false,
    executionBlocker: 'execution_evidence_missing',
  })
  assert.equal(status, 'unexpectedly_dark')
  assert.equal(cosUniversityLaneStatusIsFault(status), true)
})

test('a lane with no receipt on this build is dark, never accused of having its flag off', () => {
  // featureEnabled is read out of receipt evidence. With no receipt it is false by absence, and
  // the board has observed nothing whatsoever about the environment variable.
  for (const path of ['registered_agent_cycle', 'deliberate_practice', 'subject_a_range_evidence'] as const) {
    const status = classifyCosUniversityLane(
      cosUniversityLaneExpectation({ path, timingByLevel: RESIDENCE }),
      {
        path, receiptFound: false, featureEnabled: false, verified: false,
        executionBlocker: 'execution_evidence_missing',
      },
    )
    assert.equal(status, 'unexpectedly_dark')
    assert.equal(cosUniversityLaneStatusIsFault(status), true)
  }
})

test('the Sep 13 fresh deployment reported no lane as disabled', () => {
  // Every path on commit 8caa54cd carried receiptFound false and featureEnabled false. Under the
  // previous rule that produced seven unexpectedly_disabled faults, three of them for lanes
  // verified enabled two hours earlier. Dark is claimable from that board; disabled is not.
  const statuses = ([
    'registered_agent_cycle', 'continuous_learning', 'deliberate_practice', 'independent_exams',
    'subject_a_range_evidence', 'language_a_range_evidence', 'delayed_retention',
  ] as const).map(path => classifyCosUniversityLane(
    cosUniversityLaneExpectation({ path, timingByLevel: RESIDENCE }),
    {
      path, receiptFound: false, featureEnabled: false, verified: false,
      executionBlocker: 'execution_evidence_missing',
    },
  ))
  assert.equal(statuses.includes('unexpectedly_disabled'), false)
  assert.deepEqual([...new Set(statuses)], ['unexpectedly_dark'])
})

test('runner_not_invoked is patience, not a fault — the A-range lanes clear themselves', () => {
  for (const path of ['subject_a_range_evidence', 'language_a_range_evidence', 'delayed_retention'] as const) {
    const status = classifyCosUniversityLane(
      cosUniversityLaneExpectation({ path, timingByLevel: RESIDENCE }),
      {
        path, receiptFound: true, featureEnabled: true, verified: false,
        executionBlocker: 'runner_not_invoked',
      },
    )
    assert.equal(status, 'idle_no_eligible_work')
    assert.equal(cosUniversityLaneStatusIsFault(status), false)
  }
})

test('the verified lanes report as running', () => {
  for (const path of ['registered_agent_cycle', 'continuous_learning', 'deliberate_practice'] as const) {
    const status = classifyCosUniversityLane(
      cosUniversityLaneExpectation({ path, timingByLevel: RESIDENCE }),
      { path, receiptFound: true, featureEnabled: true, verified: true, executionBlocker: null },
    )
    assert.equal(status, 'running_as_expected')
  }
})

test('paths for a program nobody is enrolled in owe no receipt', () => {
  for (const path of ['masters_learning', 'masters_exams', 'phd_runtime', 'phd_progress'] as const) {
    const expectation = cosUniversityLaneExpectation({ path, timingByLevel: RESIDENCE })
    assert.equal(expectation, 'expected_absent')
    assert.equal(classifyCosUniversityLane(expectation, {
      path, receiptFound: false, featureEnabled: false, verified: false,
    }), 'absent_as_expected')
  }
})

test('PhD research running while nobody is enrolled in a PhD is staging drift, and is surfaced', () => {
  const expectation = cosUniversityLaneExpectation({ path: 'phd_research', timingByLevel: RESIDENCE })
  assert.equal(expectation, 'expected_absent')
  // Absent paths owe nothing, so an enabled one is not an incident — but with a PhD enrolled and
  // gated, an enabled terminal path is drift and must be visible.
  const gated = cosUniversityLaneExpectation({
    path: 'phd_admission',
    timingByLevel: { undergraduate: 'minimum_residence', phd: 'minimum_residence' },
    terminalPrerequisiteMet: false,
  })
  assert.equal(gated, 'expected_gated')
  const status = classifyCosUniversityLane(gated, {
    path: 'phd_admission', receiptFound: true, featureEnabled: true, verified: true,
  })
  assert.equal(status, 'unexpectedly_enabled')
  assert.equal(cosUniversityLaneStatusIsFault(status), true)
})

test('a gated lane with no receipt is never called drift', () => {
  const gated = cosUniversityLaneExpectation({
    path: 'phd_admission',
    timingByLevel: { undergraduate: 'minimum_residence', phd: 'minimum_residence' },
    terminalPrerequisiteMet: false,
  })
  const status = classifyCosUniversityLane(gated, {
    path: 'phd_admission', receiptFound: false, featureEnabled: true, verified: false,
  })
  assert.equal(status, 'gated_as_expected')
  assert.equal(cosUniversityLaneStatusIsFault(status), false)
})

test('graduation becomes expected once its prerequisite is met', () => {
  const expectation = cosUniversityLaneExpectation({
    path: 'graduation',
    timingByLevel: { undergraduate: 'on_schedule' },
    terminalPrerequisiteMet: true,
  })
  assert.equal(expectation, 'expected_running')
})

test('an expired program stops expecting anything', () => {
  const expectation = cosUniversityLaneExpectation({
    path: 'continuous_learning', timingByLevel: { undergraduate: 'deadline_expired' },
  })
  assert.equal(expectation, 'expected_absent')
})

test('fine tuning belongs to no calendar and is never reported dark', () => {
  const expectation = cosUniversityLaneExpectation({ path: 'controlled_fine_tuning', timingByLevel: RESIDENCE })
  assert.equal(expectation, 'expected_gated')
  assert.equal(classifyCosUniversityLane(expectation, {
    path: 'controlled_fine_tuning', receiptFound: true, featureEnabled: true, verified: false,
    executionBlocker: 'runner_not_invoked',
  }), 'gated_as_expected')
})

test('an undeclared path is never assumed healthy', () => {
  const expectation = cosUniversityLaneExpectation({
    path: 'some_future_lane' as never, timingByLevel: RESIDENCE,
  })
  assert.equal(expectation, 'undeclared')
  const status = classifyCosUniversityLane(expectation, {
    path: 'some_future_lane' as never, receiptFound: true, featureEnabled: true, verified: true,
  })
  assert.equal(status, 'undeclared')
  assert.equal(cosUniversityLaneStatusIsFault(status), true)
})

test('the whole Sep 13 board yields exactly one fault', () => {
  const board = [
    { path: 'registered_agent_cycle', receiptFound: true, featureEnabled: true, verified: true, executionBlocker: null },
    { path: 'continuous_learning', receiptFound: true, featureEnabled: true, verified: true, executionBlocker: null },
    { path: 'deliberate_practice', receiptFound: true, featureEnabled: true, verified: true, executionBlocker: null },
    { path: 'independent_exams', receiptFound: true, featureEnabled: false, verified: false, executionBlocker: 'execution_evidence_missing' },
    { path: 'subject_a_range_evidence', receiptFound: true, featureEnabled: true, verified: false, executionBlocker: 'runner_not_invoked' },
    { path: 'language_a_range_evidence', receiptFound: true, featureEnabled: true, verified: false, executionBlocker: 'runner_not_invoked' },
    { path: 'delayed_retention', receiptFound: true, featureEnabled: true, verified: false, executionBlocker: 'runner_not_invoked' },
    { path: 'graduation', receiptFound: false, featureEnabled: false, verified: false, executionBlocker: 'execution_evidence_missing' },
    { path: 'masters_learning', receiptFound: false, featureEnabled: false, verified: false, executionBlocker: 'execution_evidence_missing' },
    { path: 'masters_admission', receiptFound: false, featureEnabled: false, verified: false, executionBlocker: 'execution_evidence_missing' },
    { path: 'masters_exams', receiptFound: false, featureEnabled: false, verified: false, executionBlocker: 'execution_evidence_missing' },
    { path: 'masters_progress', receiptFound: false, featureEnabled: false, verified: false, executionBlocker: 'execution_evidence_missing' },
    { path: 'phd_runtime', receiptFound: false, featureEnabled: false, verified: false, executionBlocker: 'execution_evidence_missing' },
    { path: 'phd_admission', receiptFound: false, featureEnabled: false, verified: false, executionBlocker: 'execution_evidence_missing' },
    { path: 'phd_progress', receiptFound: false, featureEnabled: false, verified: false, executionBlocker: 'execution_evidence_missing' },
    { path: 'phd_research', receiptFound: true, featureEnabled: true, verified: true, executionBlocker: null },
    { path: 'phd_methodology_exams', receiptFound: true, featureEnabled: true, verified: true, executionBlocker: null },
    { path: 'controlled_fine_tuning', receiptFound: true, featureEnabled: true, verified: false, executionBlocker: 'runner_not_invoked' },
  ] as const

  const faults = board
    .map(row => ({
      path: row.path,
      status: classifyCosUniversityLane(
        cosUniversityLaneExpectation({ path: row.path as never, timingByLevel: RESIDENCE }),
        row as never,
      ),
    }))
    .filter(row => cosUniversityLaneStatusIsFault(row.status))

  // Thirteen paths were unverified. Exactly one of them was an incident.
  assert.deepEqual(faults, [{ path: 'independent_exams', status: 'unexpectedly_disabled' }])
})
