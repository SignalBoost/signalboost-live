export const DEFAULT_UNIVERSITY_MAX_PRACTICE_ROUNDS = 12

type PracticeBudgetEnv = { UNIVERSITY_MAX_PRACTICE_ROUNDS?: string }

export type UniversityPracticeBudgetDecision = Readonly<{
  allowed: boolean
  reason: 'within_budget' | 'current_round_already_metered' | 'practice_budget_exhausted' | 'practice_round_invalid'
  maxRounds: number
  executedRoundCount: number
  currentRound: number | null
}>

function boundedRound(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null
}

function positiveCount(value: unknown): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

export function configuredUniversityMaxPracticeRounds(
  env: PracticeBudgetEnv = { UNIVERSITY_MAX_PRACTICE_ROUNDS: process.env.UNIVERSITY_MAX_PRACTICE_ROUNDS },
): number {
  const configured = Number(env.UNIVERSITY_MAX_PRACTICE_ROUNDS || DEFAULT_UNIVERSITY_MAX_PRACTICE_ROUNDS)
  return Number.isSafeInteger(configured)
    ? Math.max(2, Math.min(50, configured))
    : DEFAULT_UNIVERSITY_MAX_PRACTICE_ROUNDS
}

/**
 * A round starts consuming the cost budget when the host durably records a model invocation, not
 * only when the later practice-result transaction succeeds. `attemptCount` keeps historical rows
 * compatible; `practiceInvocationCount` closes the inference-success / persistence-failure gap.
 */
export function practiceBudgetRoundFromEvidence(input: {
  practiceRound: unknown
  attemptCount: unknown
  practiceInvocationCount: unknown
}): number | null {
  if (positiveCount(input.attemptCount) === 0 && positiveCount(input.practiceInvocationCount) === 0) return null
  return boundedRound(input.practiceRound)
}

/**
 * The study-attempt ordinal is not spend. A plan may restudy many times without invoking inference,
 * so the cost ceiling counts only distinct practice rounds with durable invocation/attempt evidence.
 * If one variant of the current round already consumed inference, the sibling variant may finish
 * that same already-metered round without charging a second round.
 */
export function decideUniversityPracticeBudget(input: {
  currentRound: unknown
  executedRounds: Iterable<unknown>
  maxRounds?: number
}): UniversityPracticeBudgetDecision {
  const currentRound = boundedRound(input.currentRound)
  const maxRounds = Number.isSafeInteger(input.maxRounds)
    ? Math.max(2, Math.min(50, Number(input.maxRounds)))
    : configuredUniversityMaxPracticeRounds()
  const executed = new Set<number>()
  for (const value of input.executedRounds) {
    const round = boundedRound(value)
    if (round) executed.add(round)
  }

  if (!currentRound) {
    return { allowed: false, reason: 'practice_round_invalid', maxRounds, executedRoundCount: executed.size, currentRound: null }
  }
  if (executed.has(currentRound)) {
    return { allowed: true, reason: 'current_round_already_metered', maxRounds, executedRoundCount: executed.size, currentRound }
  }
  if (executed.size >= maxRounds) {
    return { allowed: false, reason: 'practice_budget_exhausted', maxRounds, executedRoundCount: executed.size, currentRound }
  }
  return { allowed: true, reason: 'within_budget', maxRounds, executedRoundCount: executed.size, currentRound }
}
