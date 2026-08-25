// saas/lib/ai/cos/cacheSafetyPolicy.ts
import { executiveDecisionDirective } from './scriptRequestIntent.ts'
import { isPlatformSelfKnowledgePrompt } from './cosFreshnessPolicy.ts'

/**
 * Executive arbitration is high-impact, context-dependent reasoning. Replaying a prior memo can
 * bypass newly deployed claim guards and preserve stale commercial conclusions, so it must be
 * reasoned afresh even when the wording repeats.
 *
 * Platform self-knowledge (what is SignalBoost / who owns it / what model powers COS) is excluded
 * for the same reason in a sharper form: the answer depends on the LIVE reasoner configuration and
 * the caller's privilege tier. A cached replay serves yesterday's stack, or the wrong disclosure
 * level for this caller. Owner-verified 2026-08-25: the privileged technical self-description
 * shipped and deployed, but the owner's repeated identity question kept replaying the pre-change
 * cached answer — this exclusion is what makes self-knowledge changes take effect immediately.
 */
export function semanticCacheAllowedForPrompt(prompt: string): boolean {
  if (executiveDecisionDirective(prompt)) return false
  if (isPlatformSelfKnowledgePrompt(prompt)) return false
  return true
}
