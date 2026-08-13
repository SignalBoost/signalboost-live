export type CognitiveSkillStatus =
  | 'encountered'
  | 'evaluated'
  | 'understood'
  | 'practiced'
  | 'validated'
  | 'learned'
  | 'mastered'
  | 'weakened'
  | 'quarantined'

export type CognitiveSkillEvidence = {
  evaluatorApproved: boolean
  understandingApproved: boolean
  practiceAttempts: number
  practiceSuccesses: number
  holdoutAttempts: number
  holdoutSuccesses: number
  distinctHoldoutVariants: number
  productionAttempts: number
  productionSuccesses: number
  failureCount: number
  lastValidatedAt?: string | null
  quarantined?: boolean
}

export type CognitivePromotionPolicy = {
  minPracticeAttemptsForPracticed: number
  minHoldoutAttemptsForValidated: number
  minHoldoutVariantsForValidated: number
  minHoldoutRateForValidated: number
  minHoldoutAttemptsForLearned: number
  minHoldoutVariantsForLearned: number
  minHoldoutRateForLearned: number
  minHoldoutAttemptsForMastered: number
  minHoldoutVariantsForMastered: number
  minHoldoutRateForMastered: number
  minProductionAttemptsForMastered: number
  minProductionRateForMastered: number
  validationFreshnessDays: number
}

/**
 * These are minimum evidence requirements for lifecycle promotion, not COS answer-confidence
 * thresholds and not claims about intelligence. They are deliberately configurable and should be
 * recalibrated from held-out benchmark evidence as the cognitive-learning dataset grows.
 */
export const DEFAULT_COGNITIVE_PROMOTION_POLICY: CognitivePromotionPolicy = {
  minPracticeAttemptsForPracticed: 2,
  minHoldoutAttemptsForValidated: 3,
  minHoldoutVariantsForValidated: 3,
  minHoldoutRateForValidated: 0.8,
  minHoldoutAttemptsForLearned: 5,
  minHoldoutVariantsForLearned: 4,
  minHoldoutRateForLearned: 0.85,
  minHoldoutAttemptsForMastered: 20,
  minHoldoutVariantsForMastered: 10,
  minHoldoutRateForMastered: 0.92,
  minProductionAttemptsForMastered: 5,
  minProductionRateForMastered: 0.9,
  validationFreshnessDays: 30,
}

export type CognitiveSkillEligibility = {
  recommendedStatus: CognitiveSkillStatus
  practiceRate: number | null
  holdoutRate: number | null
  productionRate: number | null
  validationFresh: boolean
  reasons: string[]
}

function boundedCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

function rate(successes: number, attempts: number): number | null {
  const a = boundedCount(attempts)
  if (!a) return null
  return Math.min(1, boundedCount(successes) / a)
}

function validationFresh(lastValidatedAt: string | null | undefined, freshnessDays: number, nowMs: number): boolean {
  if (!lastValidatedAt) return false
  const parsed = Date.parse(lastValidatedAt)
  if (!Number.isFinite(parsed)) return false
  return nowMs - parsed <= Math.max(1, freshnessDays) * 86_400_000
}

/**
 * Determine the strongest lifecycle state supported by the supplied evidence.
 *
 * This function never changes answer confidence. It also never turns a teacher example into skill
 * mastery. Qualitative evaluator/understanding approvals are explicit prerequisites, and
 * learned/mastered require held-out variants rather than training-example reuse.
 */
export function evaluateCognitiveSkillEligibility(
  evidence: CognitiveSkillEvidence,
  policy: CognitivePromotionPolicy = DEFAULT_COGNITIVE_PROMOTION_POLICY,
  nowMs = Date.now(),
): CognitiveSkillEligibility {
  const practiceAttempts = boundedCount(evidence.practiceAttempts)
  const holdoutAttempts = boundedCount(evidence.holdoutAttempts)
  const productionAttempts = boundedCount(evidence.productionAttempts)
  const practiceRate = rate(evidence.practiceSuccesses, practiceAttempts)
  const holdoutRate = rate(evidence.holdoutSuccesses, holdoutAttempts)
  const productionRate = rate(evidence.productionSuccesses, productionAttempts)
  const fresh = validationFresh(evidence.lastValidatedAt, policy.validationFreshnessDays, nowMs)
  const reasons: string[] = []

  if (evidence.quarantined) {
    return {
      recommendedStatus: 'quarantined',
      practiceRate,
      holdoutRate,
      productionRate,
      validationFresh: fresh,
      reasons: ['Skill is explicitly quarantined.'],
    }
  }

  let recommendedStatus: CognitiveSkillStatus = 'encountered'

  if (!evidence.evaluatorApproved) {
    reasons.push('Awaiting evaluator review; encounter is not understanding.')
    return { recommendedStatus, practiceRate, holdoutRate, productionRate, validationFresh: fresh, reasons }
  }
  recommendedStatus = 'evaluated'

  if (!evidence.understandingApproved) {
    reasons.push('Evaluator review exists, but reusable understanding has not been approved.')
    return { recommendedStatus, practiceRate, holdoutRate, productionRate, validationFresh: fresh, reasons }
  }
  recommendedStatus = 'understood'

  if (practiceAttempts < policy.minPracticeAttemptsForPracticed) {
    reasons.push(`Needs at least ${policy.minPracticeAttemptsForPracticed} practice attempts.`)
    return { recommendedStatus, practiceRate, holdoutRate, productionRate, validationFresh: fresh, reasons }
  }
  recommendedStatus = 'practiced'

  if (
    holdoutAttempts < policy.minHoldoutAttemptsForValidated ||
    boundedCount(evidence.distinctHoldoutVariants) < policy.minHoldoutVariantsForValidated ||
    holdoutRate === null ||
    holdoutRate < policy.minHoldoutRateForValidated
  ) {
    reasons.push('Practice exists, but held-out validation evidence is not yet sufficient.')
    return { recommendedStatus, practiceRate, holdoutRate, productionRate, validationFresh: fresh, reasons }
  }
  recommendedStatus = 'validated'

  if (
    holdoutAttempts < policy.minHoldoutAttemptsForLearned ||
    boundedCount(evidence.distinctHoldoutVariants) < policy.minHoldoutVariantsForLearned ||
    holdoutRate < policy.minHoldoutRateForLearned ||
    !fresh
  ) {
    reasons.push('Validated, but evidence is not yet broad/fresh enough to call the skill learned.')
    return { recommendedStatus, practiceRate, holdoutRate, productionRate, validationFresh: fresh, reasons }
  }
  recommendedStatus = 'learned'

  if (
    holdoutAttempts < policy.minHoldoutAttemptsForMastered ||
    boundedCount(evidence.distinctHoldoutVariants) < policy.minHoldoutVariantsForMastered ||
    holdoutRate < policy.minHoldoutRateForMastered ||
    productionAttempts < policy.minProductionAttemptsForMastered ||
    productionRate === null ||
    productionRate < policy.minProductionRateForMastered ||
    !fresh
  ) {
    reasons.push('Learned skill has not yet accumulated enough held-out and production evidence for mastery.')
    return { recommendedStatus, practiceRate, holdoutRate, productionRate, validationFresh: fresh, reasons }
  }

  recommendedStatus = 'mastered'
  reasons.push('Held-out breadth, recent validation, and production outcomes satisfy the configured mastery evidence policy.')
  return { recommendedStatus, practiceRate, holdoutRate, productionRate, validationFresh: fresh, reasons }
}
