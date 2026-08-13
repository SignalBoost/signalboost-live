export type CognitiveCompositionStatus =
  | 'candidate'
  | 'evaluated'
  | 'practiced'
  | 'validated'
  | 'learned'
  | 'weakened'
  | 'quarantined'

export type CognitiveCompositionEvidence = {
  evaluatorApproved: boolean
  practiceAttempts: number
  practiceSuccesses: number
  transferAttempts: number
  transferSuccesses: number
  distinctTransferVariants: number
  compositeScoreTotal: number
  bestMemberScoreTotal: number
  compositeWinCount: number
  failureCount: number
  lastValidatedAt?: string | null
  weakened?: boolean
  quarantined?: boolean
}

export type CognitiveCompositionPromotionPolicy = {
  minPracticeAttemptsForPracticed: number
  minPracticeRateForPracticed: number
  minTransferAttemptsForValidated: number
  minTransferVariantsForValidated: number
  minTransferRateForValidated: number
  minMeanAdvantageForValidated: number
  minCompositeWinRateForValidated: number
  minTransferAttemptsForLearned: number
  minTransferVariantsForLearned: number
  minTransferRateForLearned: number
  minMeanAdvantageForLearned: number
  minCompositeWinRateForLearned: number
  validationFreshnessDays: number
}

/**
 * Composition promotion is intentionally harder than merely passing a task. A reusable composite
 * procedure must outperform the strongest single member on independent transfer cases; otherwise
 * COS has not demonstrated that composition adds capability.
 */
export const DEFAULT_COGNITIVE_COMPOSITION_POLICY: CognitiveCompositionPromotionPolicy = {
  minPracticeAttemptsForPracticed: 2,
  minPracticeRateForPracticed: 0.7,
  minTransferAttemptsForValidated: 3,
  minTransferVariantsForValidated: 3,
  minTransferRateForValidated: 0.8,
  minMeanAdvantageForValidated: 0.08,
  minCompositeWinRateForValidated: 2 / 3,
  minTransferAttemptsForLearned: 5,
  minTransferVariantsForLearned: 4,
  minTransferRateForLearned: 0.85,
  minMeanAdvantageForLearned: 0.1,
  minCompositeWinRateForLearned: 0.7,
  validationFreshnessDays: 30,
}

export type CognitiveCompositionEligibility = {
  recommendedStatus: CognitiveCompositionStatus
  practiceRate: number | null
  transferRate: number | null
  meanCompositeScore: number | null
  meanBestMemberScore: number | null
  meanAdvantage: number | null
  compositeWinRate: number | null
  validationFresh: boolean
  reasons: string[]
}

export type CognitiveCompositionOpportunity = {
  eligible: boolean
  memberCount: number
  topSimilarity: number | null
  secondSimilarity: number | null
  relevanceGap: number | null
  reason: string
}

function count(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

function rate(successes: number, attempts: number): number | null {
  const a = count(attempts)
  if (!a) return null
  return Math.max(0, Math.min(1, count(successes) / a))
}

function average(total: number, attempts: number): number | null {
  const a = count(attempts)
  if (!a || !Number.isFinite(total)) return null
  return Math.max(0, Math.min(1, total / a))
}

function fresh(lastValidatedAt: string | null | undefined, days: number, nowMs: number): boolean {
  if (!lastValidatedAt) return false
  const parsed = Date.parse(lastValidatedAt)
  if (!Number.isFinite(parsed)) return false
  return nowMs - parsed <= Math.max(1, days) * 86_400_000
}

/**
 * Use multiple skills only when relevance is genuinely distributed. Retrieval has already applied
 * the normal semantic floor; this check prevents a weak second skill from being attached merely to
 * manufacture a "composition" claim.
 */
export function assessCognitiveCompositionOpportunity(
  similarities: number[],
  options: { maxRelevanceGap?: number; minSecondSimilarity?: number } = {},
): CognitiveCompositionOpportunity {
  const ranked = similarities.filter(Number.isFinite).map(value => Math.max(0, Math.min(1, value))).sort((a, b) => b - a)
  const top = ranked[0] ?? null
  const second = ranked[1] ?? null
  if (ranked.length < 2 || top === null || second === null) {
    return { eligible: false, memberCount: ranked.length, topSimilarity: top, secondSimilarity: second, relevanceGap: null, reason: 'needs_at_least_two_relevant_validated_skills' }
  }
  const minSecond = Number.isFinite(options.minSecondSimilarity) ? Math.max(0.3, Math.min(0.95, Number(options.minSecondSimilarity))) : 0.55
  const maxGap = Number.isFinite(options.maxRelevanceGap) ? Math.max(0.05, Math.min(0.6, Number(options.maxRelevanceGap))) : 0.25
  const gap = top - second
  if (second < minSecond) {
    return { eligible: false, memberCount: ranked.length, topSimilarity: top, secondSimilarity: second, relevanceGap: gap, reason: 'second_skill_relevance_too_weak' }
  }
  if (gap > maxGap) {
    return { eligible: false, memberCount: ranked.length, topSimilarity: top, secondSimilarity: second, relevanceGap: gap, reason: 'single_skill_dominates_relevance' }
  }
  return { eligible: true, memberCount: ranked.length, topSimilarity: top, secondSimilarity: second, relevanceGap: gap, reason: 'distributed_multi_skill_relevance' }
}

export function evaluateCognitiveCompositionEligibility(
  evidence: CognitiveCompositionEvidence,
  policy: CognitiveCompositionPromotionPolicy = DEFAULT_COGNITIVE_COMPOSITION_POLICY,
  nowMs = Date.now(),
): CognitiveCompositionEligibility {
  const practiceAttempts = count(evidence.practiceAttempts)
  const transferAttempts = count(evidence.transferAttempts)
  const practiceRate = rate(evidence.practiceSuccesses, practiceAttempts)
  const transferRate = rate(evidence.transferSuccesses, transferAttempts)
  const meanCompositeScore = average(evidence.compositeScoreTotal, transferAttempts)
  const meanBestMemberScore = average(evidence.bestMemberScoreTotal, transferAttempts)
  const meanAdvantage = meanCompositeScore === null || meanBestMemberScore === null ? null : meanCompositeScore - meanBestMemberScore
  const compositeWinRate = rate(evidence.compositeWinCount, transferAttempts)
  const validationFresh = fresh(evidence.lastValidatedAt, policy.validationFreshnessDays, nowMs)
  const reasons: string[] = []

  if (evidence.quarantined) {
    return { recommendedStatus: 'quarantined', practiceRate, transferRate, meanCompositeScore, meanBestMemberScore, meanAdvantage, compositeWinRate, validationFresh, reasons: ['Composition is explicitly quarantined.'] }
  }
  if (evidence.weakened) {
    return { recommendedStatus: 'weakened', practiceRate, transferRate, meanCompositeScore, meanBestMemberScore, meanAdvantage, compositeWinRate, validationFresh, reasons: ['Composition is explicitly weakened pending fresh transfer evidence.'] }
  }

  let recommendedStatus: CognitiveCompositionStatus = 'candidate'
  if (!evidence.evaluatorApproved) {
    reasons.push('Awaiting independent evaluator approval.')
    return { recommendedStatus, practiceRate, transferRate, meanCompositeScore, meanBestMemberScore, meanAdvantage, compositeWinRate, validationFresh, reasons }
  }
  recommendedStatus = 'evaluated'

  if (practiceAttempts < policy.minPracticeAttemptsForPracticed || practiceRate === null || practiceRate < policy.minPracticeRateForPracticed) {
    reasons.push('Needs successful local practice before transfer validation.')
    return { recommendedStatus, practiceRate, transferRate, meanCompositeScore, meanBestMemberScore, meanAdvantage, compositeWinRate, validationFresh, reasons }
  }
  recommendedStatus = 'practiced'

  if (
    transferAttempts < policy.minTransferAttemptsForValidated ||
    count(evidence.distinctTransferVariants) < policy.minTransferVariantsForValidated ||
    transferRate === null || transferRate < policy.minTransferRateForValidated ||
    meanAdvantage === null || meanAdvantage < policy.minMeanAdvantageForValidated ||
    compositeWinRate === null || compositeWinRate < policy.minCompositeWinRateForValidated
  ) {
    reasons.push('Composite has not yet demonstrated independent transfer advantage over its strongest single member.')
    return { recommendedStatus, practiceRate, transferRate, meanCompositeScore, meanBestMemberScore, meanAdvantage, compositeWinRate, validationFresh, reasons }
  }
  recommendedStatus = 'validated'

  if (
    transferAttempts < policy.minTransferAttemptsForLearned ||
    count(evidence.distinctTransferVariants) < policy.minTransferVariantsForLearned ||
    transferRate < policy.minTransferRateForLearned ||
    meanAdvantage < policy.minMeanAdvantageForLearned ||
    compositeWinRate < policy.minCompositeWinRateForLearned ||
    !validationFresh
  ) {
    reasons.push('Validated composition needs broader, fresh transfer evidence before being called learned.')
    return { recommendedStatus, practiceRate, transferRate, meanCompositeScore, meanBestMemberScore, meanAdvantage, compositeWinRate, validationFresh, reasons }
  }

  recommendedStatus = 'learned'
  reasons.push('Independent transfer breadth and measurable advantage over the best single member satisfy the learned-composition policy.')
  return { recommendedStatus, practiceRate, transferRate, meanCompositeScore, meanBestMemberScore, meanAdvantage, compositeWinRate, validationFresh, reasons }
}
