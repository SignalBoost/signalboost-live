//
// Owner, 2026-10-03: "the pipeline still not working - the artifacts are not moving downstream and continuously."
//
// Production state that day: 237 mass artifacts at `evaluation_ready`, ZERO at `evaluation_pending`, zero admitted in
// 24 hours, 16 graduates `active` with no movement. Training kept producing (11 new artifacts in the last 6 hours) and
// the canary kept approving deploys (6 in the same window), so the head of the line was alive - and nothing crossed it.
//
// The reason is one line in the exam-set writer:
//
//     .lt('attempts', HOLDOUT_EXAM_MAX_SET_ATTEMPTS)      // max = 3
//
// Admission to `evaluation_pending` requires a holdout exam set at `status = 'ready'`. The writer builds those sets,
// and every failure increments `attempts`. At 3 the set becomes INVISIBLE to the writer forever: it can never reach
// `ready`, so `holdoutExamReadyArtifacts` never returns its artifact, so the evaluation route never admits it, so it
// sits at `evaluation_ready` for the rest of time. The lane reports `no_mass_artifact_with_holdout_exam_ready`, which
// reads like "nothing to do" rather than "every candidate is permanently disqualified".
//
// What makes it severe is WHICH failures spend that budget. These two are read once per RUN, before the per-set loop,
// and are not properties of any artifact at all:
//
//     no_active_mass_teacher      no University teacher is currently enabled
//     hf_token_missing            HF_TOKEN is absent or too short
//
// While either holds, the writer marks 10 sets failed per tick, 6 ticks an hour. Sixty sets an hour burn an attempt
// for a reason that has nothing to do with them, and within half a day the entire requested population is out of
// reach permanently. A brief outage becomes an irreversible line stop. `exam_items_incomplete` is the same mistake in
// smaller type: a rate-limited or unparseable teacher reply is a transient fault, and it too spends the budget.
//
// This module is the classification that fixes it, and it is the owner's existing rule applied to a new place: OUR
// fault, so the student does not pay for it. It is pure, decides nothing about quality, and spends nothing.

/** What kind of fault a writer failure reason represents. The kind decides who pays for it. */
export type ExamSetFailureKind =
  /** Not about the artifact at all - a missing teacher or credential. The run must stop; no set may be charged. */
  | 'global_precondition'
  /** Real but passing - a provider error, timeout, rate limit, unparseable reply, network read. Retry, do not charge. */
  | 'transient'
  /** The set genuinely cannot be built from the data it points at. Charging an attempt is correct, and it must be visible. */
  | 'structural'

/**
 * Reasons that are properties of the deployment, not of a set.
 *
 * Both are evaluated once per run, before any set is examined. Marking individual sets failed for either one is a
 * category error with permanent consequences, so the writer must abort the run instead.
 */
export const EXAM_SET_GLOBAL_PRECONDITIONS: readonly string[] = Object.freeze([
  'no_active_mass_teacher',
  'hf_token_missing',
])

/**
 * Reasons that mean this set's own pinned data cannot produce an exam.
 *
 * These are durable: the holdout reference is malformed, the run binding is gone, the item hashes are not hashes.
 * Retrying cannot help, so the attempt budget is the right instrument - provided the exhaustion is REPORTED rather
 * than silently removing the artifact from the line.
 */
export const EXAM_SET_STRUCTURAL_FAILURES: readonly string[] = Object.freeze([
  'mass_run_binding_missing',
  'holdout_ref_invalid',
  'holdout_count_invalid',
  'holdout_item_hash_invalid',
])

/** How long an exhausted set waits before the governed sweep may give it a fresh budget. */
export const EXAM_SET_RECOVERY_COOLOFF_MS = 2 * 60 * 60 * 1000

/** Bound on how many exhausted sets one sweep may revive, so a recovery can never become a stampede. */
export const EXAM_SET_RECOVERY_MAX_PER_RUN = 25

const normalise = (reason: unknown): string => String(reason ?? '').trim().toLowerCase()

/**
 * Pure: what kind of failure this is.
 *
 * An unrecognised reason is TRANSIENT, deliberately. A reason this module has not heard of is almost always a thrown
 * provider or network error, and the cost of the two mistakes is not symmetric: treating a transient fault as
 * structural removes an artifact from the line forever, while treating a structural fault as transient costs a few
 * retries that keep failing visibly. Prefer the recoverable error.
 */
export function classifyExamSetFailure(reason: unknown): ExamSetFailureKind {
  const value = normalise(reason)
  if (!value) return 'transient'
  if (EXAM_SET_GLOBAL_PRECONDITIONS.includes(value)) return 'global_precondition'
  if (EXAM_SET_STRUCTURAL_FAILURES.includes(value)) return 'structural'
  // `exam_items_incomplete:3/12` - the teacher did not answer usably for some items. Passing, not structural.
  if (value.startsWith('exam_items_incomplete')) return 'transient'
  return 'transient'
}

/** Only a structural failure spends a set's attempt budget. */
export function shouldChargeAttempt(reason: unknown): boolean {
  return classifyExamSetFailure(reason) === 'structural'
}

/** A global precondition must stop the whole run; continuing would mark every set in the batch failed. */
export function shouldAbortRun(reason: unknown): boolean {
  return classifyExamSetFailure(reason) === 'global_precondition'
}

export type ExamSetRecoveryCandidate = Readonly<{
  candidateId: string
  artifactHash: string
  attempts: number
  lastError: string | null
  updatedAt: string | null
}>

export type ExamSetRecoveryDecision = Readonly<{
  candidateId: string
  artifactHash: string
  /** Why this set is being given a fresh budget, recorded on the set so the revival is auditable. */
  reason: 'exhausted_by_global_precondition' | 'exhausted_by_transient_failure'
  previousAttempts: number
  authorityExpanded: false
}>

const parsedMs = (value: string | null | undefined): number | null => {
  if (!value) return null
  const at = Date.parse(String(value))
  return Number.isFinite(at) ? at : null
}

/**
 * Pure: which exhausted sets may be given a fresh attempt budget.
 *
 * A set is revived only when it is genuinely out of budget, has been quiet for the cool-off, and its recorded failure
 * was NOT structural. A set whose holdout data is malformed is left exhausted on purpose - reviving it would spend
 * teacher calls on something that cannot succeed, and the honest treatment is to report it, not retry it.
 *
 * An unreadable clock is treated as not yet cooled off: no claim, no action.
 */
export function decideExamSetRecovery(input: {
  sets: readonly ExamSetRecoveryCandidate[]
  now: Date
  maxAttempts: number
  cooloffMs?: number
  maxPerRun?: number
}): readonly ExamSetRecoveryDecision[] {
  const nowMs = input.now instanceof Date ? input.now.getTime() : Number.NaN
  if (!Number.isFinite(nowMs)) return Object.freeze([])
  const cooloff = Number.isFinite(input.cooloffMs as number) && (input.cooloffMs as number) >= 0
    ? (input.cooloffMs as number)
    : EXAM_SET_RECOVERY_COOLOFF_MS
  const limit = Number.isSafeInteger(input.maxPerRun as number) && (input.maxPerRun as number) > 0
    ? (input.maxPerRun as number)
    : EXAM_SET_RECOVERY_MAX_PER_RUN
  const maxAttempts = Math.max(1, Math.floor(Number(input.maxAttempts) || 1))

  const decisions: ExamSetRecoveryDecision[] = []
  for (const set of input.sets) {
    if (decisions.length >= limit) break
    const candidateId = String(set.candidateId || '').trim()
    const artifactHash = String(set.artifactHash || '').trim().toLowerCase()
    if (!candidateId || !artifactHash) continue
    const attempts = Math.floor(Number(set.attempts) || 0)
    // Still inside its own budget: the writer will pick it up normally, so there is nothing to revive.
    if (attempts < maxAttempts) continue
    const quietSince = parsedMs(set.updatedAt)
    if (quietSince === null || nowMs - quietSince < cooloff) continue

    const kind = classifyExamSetFailure(set.lastError)
    if (kind === 'structural') continue
    decisions.push(Object.freeze({
      candidateId,
      artifactHash,
      reason: kind === 'global_precondition' ? 'exhausted_by_global_precondition' : 'exhausted_by_transient_failure',
      previousAttempts: attempts,
      authorityExpanded: false as const,
    }))
  }
  return Object.freeze(decisions)
}

export type ExamSetPopulation = Readonly<{
  requested: number
  failed: number
  ready: number
  /** Sets at or past the attempt ceiling: invisible to the writer until the sweep revives them. */
  exhausted: number
}>

/**
 * The one number that explains a stalled exam lane.
 *
 * `no_mass_artifact_with_holdout_exam_ready` is indistinguishable from "nothing to do" unless the lane also says how
 * many sets exist and how many are out of budget. Reporting this is what turns a silent line stop into a finding.
 */
export function describeExamSetPopulation(population: ExamSetPopulation): string {
  if (population.ready > 0) return `exam sets ready=${population.ready} (requested=${population.requested}, exhausted=${population.exhausted})`
  if (population.exhausted > 0) {
    return `LINE STOP: 0 exam sets ready and ${population.exhausted} exhausted past the attempt ceiling, so no artifact can be admitted to evaluation`
  }
  if (population.requested > 0 || population.failed > 0) {
    return `no exam set ready yet: requested=${population.requested}, failed=${population.failed}`
  }
  return 'no exam sets exist yet'
}
