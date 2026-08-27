// saas/lib/ai/cos/cacheSafetyPolicy.ts
import { executiveDecisionDirective } from './scriptRequestIntent.ts'
import { isPlatformSelfKnowledgePrompt } from './cosFreshnessPolicy.ts'
import { asksForPublishedDiagnosticMethods } from './advisoryDiagnosisPolicy.ts'

/**
 * Executive arbitration is high-impact, context-dependent reasoning. Replaying a prior memo can
 * bypass newly deployed claim guards and preserve stale commercial conclusions, so it must be
 * reasoned afresh even when the wording repeats.
 *
 * Platform self-knowledge depends on live reasoner configuration and caller privilege, so it is
 * never replayed from a prompt-only cache.
 *
 * Method-seeking advisory diagnosis is also deliberately fresh at the reasoning boundary. Owner
 * policy requires COS to attempt its internal retrieval and, when wired, the bounded published
 * methods lookup before it can abstain. Replaying a cached answer would skip that required work.
 */
export function semanticCacheAllowedForPrompt(prompt: string): boolean {
  if (executiveDecisionDirective(prompt)) return false
  if (isPlatformSelfKnowledgePrompt(prompt)) return false
  if (asksForPublishedDiagnosticMethods(prompt)) return false
  return true
}
