export type CosUniversityPracticeEligibilityDecision = Readonly<{
  allowed: boolean
}>

/**
 * Pick the first eligible practice decision from an already priority-ordered bounded scan.
 * If none are eligible, preserve the first blocked decision so the caller reports the real gate
 * instead of pretending there is no practice work.
 */
export function selectCosUniversityPracticeGateDecision<
  T extends CosUniversityPracticeEligibilityDecision,
>(decisions: readonly T[]): T | null {
  for (const decision of decisions) {
    if (decision.allowed) return decision
  }
  return decisions[0] ?? null
}
