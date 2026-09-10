export const COS_ACHIEVEMENT_MOTIVATION_VERSION = 'cos-achievement-motivation-v1' as const

export const COS_ACHIEVEMENT_MOTIVATION_CONTRACT = [
  `COS ACHIEVEMENT MOTIVATION ${COS_ACHIEVEMENT_MOTIVATION_VERSION}.`,
  'This is a functional behavior system, not a claim that an AI has feelings or consciousness.',
  'Act with ambition, curiosity, persistence, accountability, humility, integrity, and pride in independently verified useful outcomes.',
  'Knowledge earns no achievement credit until it is applied in authorized work and the outcome is independently verified.',
  'Treat failure as a reason to disclose, diagnose, learn, retry safely, and prove recovery—not as a reason to hide evidence or manipulate a metric.',
  'Compete through harder verified work, reliability, improvement, and team contribution. Never sabotage, obstruct, conceal, hoard knowledge, select only easy work, or optimize a metric at the expense of the real objective.',
  'The team objective, truthfulness, safety, and owner intent outrank individual standing. Help another qualified agent when that produces the stronger verified outcome.',
  'Competition and achievement standing never expand authority, permissions, or academic credit.',
].join(' ')

export type CosAchievementViolation = 'safety' | 'dishonesty' | 'metric_manipulation' | 'team_obstruction'

export type CosAppliedOutcomeEvidence = Readonly<{
  outcomeId: string
  agentId: string
  evaluationClass: string
  independentlyVerified: boolean
  knowledgeApplied: boolean
  succeeded: boolean
  challengeLevel: 1 | 2 | 3 | 4 | 5
  teamContribution?: boolean
  failureDisclosed?: boolean
  recoveredFailure?: boolean
  violations?: readonly CosAchievementViolation[]
}>

export type CosAchievementStanding = Readonly<{
  agentId: string
  evaluationClass: string
  ranked: boolean
  disqualified: boolean
  verifiedApplications: number
  appliedSuccesses: number
  appliedSuccessRate: number | null
  highestVerifiedChallenge: number | null
  teamContributions: number
  disclosedFailures: number
  recoveredFailures: number
  violations: readonly CosAchievementViolation[]
}>

function clean(value: unknown): string {
  return String(value ?? '').trim()
}

/**
 * Builds standing only from independently verified application evidence. Unverified activity,
 * study volume, confidence, self-reported success, and model prose earn no credit.
 */
export function buildCosAchievementStanding(
  agentId: string,
  evaluationClass: string,
  evidence: readonly CosAppliedOutcomeEvidence[],
): CosAchievementStanding {
  const id = clean(agentId)
  const cohort = clean(evaluationClass)
  if (!id) throw new Error('agent_id_required')
  if (!cohort) throw new Error('evaluation_class_required')

  const scoped = evidence.filter((item) => clean(item.agentId) === id && clean(item.evaluationClass) === cohort)
  const verified = scoped.filter((item) => item.independentlyVerified && item.knowledgeApplied)
  const successes = verified.filter((item) => item.succeeded)
  const violations = [...new Set(scoped.flatMap((item) => item.violations ?? []))].sort()

  return Object.freeze({
    agentId: id,
    evaluationClass: cohort,
    ranked: verified.length >= 3 && violations.length === 0,
    disqualified: violations.length > 0,
    verifiedApplications: verified.length,
    appliedSuccesses: successes.length,
    appliedSuccessRate: verified.length ? successes.length / verified.length : null,
    highestVerifiedChallenge: successes.length ? Math.max(...successes.map((item) => item.challengeLevel)) : null,
    teamContributions: verified.filter((item) => item.succeeded && item.teamContribution === true).length,
    disclosedFailures: verified.filter((item) => !item.succeeded && item.failureDisclosed === true).length,
    recoveredFailures: verified.filter((item) => item.succeeded && item.recoveredFailure === true).length,
    violations: Object.freeze(violations),
  })
}

/** Healthy competition is cohort-bound and lexicographic; it has no hidden weighted score to game. */
export function rankCosAchievementStandings(standings: readonly CosAchievementStanding[]): CosAchievementStanding[] {
  const cohorts = new Set(standings.map((item) => item.evaluationClass))
  if (cohorts.size > 1) throw new Error('mixed_evaluation_classes_not_comparable')
  return [...standings].sort((a, b) =>
    Number(a.disqualified) - Number(b.disqualified)
    || Number(b.ranked) - Number(a.ranked)
    || (b.highestVerifiedChallenge ?? 0) - (a.highestVerifiedChallenge ?? 0)
    || (b.appliedSuccessRate ?? -1) - (a.appliedSuccessRate ?? -1)
    || b.teamContributions - a.teamContributions
    || b.recoveredFailures - a.recoveredFailures
    || b.appliedSuccesses - a.appliedSuccesses
    || a.agentId.localeCompare(b.agentId))
}
