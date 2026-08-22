export type ComparisonProgressCase = {
  id: string
  track: string
  problemClass: string
  origin?: string | null
}

export type ComparisonProgressResult = {
  case_id: string
  worker_role: string
  reasoner_label?: string | null
  verified_outcome_recorded: boolean
  problem_class?: string | null
}

export function verifiedOutcomeCountForCandidate(
  results: readonly ComparisonProgressResult[],
  args: { workerRole: string; reasonerLabel: string | null; problemClass: string },
): number {
  if (!args.reasonerLabel || !args.problemClass) return 0
  return results.filter(result =>
    result.verified_outcome_recorded
    && result.worker_role === args.workerRole
    && result.reasoner_label === args.reasonerLabel
    && result.problem_class === args.problemClass,
  ).length
}

export function distinctVerifiedCaseCount(
  results: readonly ComparisonProgressResult[],
  args: { workerRole: string; reasonerLabel: string | null; caseIds: readonly string[] },
): number {
  if (!args.reasonerLabel || !args.caseIds.length) return 0
  const allowed = new Set(args.caseIds)
  return new Set(results
    .filter(result =>
      result.verified_outcome_recorded
      && result.worker_role === args.workerRole
      && result.reasoner_label === args.reasonerLabel
      && allowed.has(result.case_id),
    )
    .map(result => result.case_id)).size
}

export function trackProblemClasses(
  cases: readonly ComparisonProgressCase[],
  args: { track: string; origin?: string | null },
): string[] {
  const values = cases
    .filter(item => item.track === args.track && (args.origin == null || item.origin === args.origin))
    .map(item => item.problemClass)
    .filter(Boolean)
  return [...new Set(values)]
}

export function nextDiverseCase(
  cases: readonly ComparisonProgressCase[],
  results: readonly ComparisonProgressResult[],
  args: {
    track: string
    roles: readonly string[]
    reasonerLabel: string | null
    origin?: string | null
  },
): ComparisonProgressCase | null {
  if (!args.reasonerLabel || args.roles.length < 2) return null
  const verified = new Set(results
    .filter(result => result.verified_outcome_recorded && result.reasoner_label === args.reasonerLabel)
    .map(result => `${result.case_id}\u0000${result.worker_role}`))

  const trackCases = cases.filter(item =>
    item.track === args.track && (args.origin == null || item.origin === args.origin),
  )
  return trackCases.find(item => args.roles.some(role => !verified.has(`${item.id}\u0000${role}`))) ?? null
}
