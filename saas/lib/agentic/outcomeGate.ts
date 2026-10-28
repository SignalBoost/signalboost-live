/**
 * Shared host-owned completion decision for COS and Builder.
 * A model's success claim does not replace verifiable receipts.
 */
export type OutcomeEvidence = Readonly<{
  requirements: readonly string[]
  satisfied: readonly string[]
  verifiedReceipts: number
  lastStepChangedEvidence: boolean
  repeatedUnproductiveSteps: number
  budgetRemaining: boolean
}>
export type OutcomeDecision = Readonly<{
  status: 'complete' | 'continue' | 'change-strategy' | 'stop-budget'
  outstanding: readonly string[]
}>
export function decideOutcome(evidence: OutcomeEvidence): OutcomeDecision {
  const satisfied = new Set(evidence.satisfied)
  const outstanding = evidence.requirements.filter(requirement => !satisfied.has(requirement))
  if (!outstanding.length && evidence.verifiedReceipts > 0)
    return { status: 'complete', outstanding }
  if (!evidence.budgetRemaining) return { status: 'stop-budget', outstanding }
  if (!evidence.lastStepChangedEvidence && evidence.repeatedUnproductiveSteps >= 2)
    return { status: 'change-strategy', outstanding }
  return { status: 'continue', outstanding }
}
