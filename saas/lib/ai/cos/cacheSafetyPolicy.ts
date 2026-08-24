import { executiveDecisionDirective } from './scriptRequestIntent.ts'

/**
 * Executive arbitration is high-impact, context-dependent reasoning. Replaying a prior memo can
 * bypass newly deployed claim guards and preserve stale commercial conclusions, so it must be
 * reasoned afresh even when the wording repeats.
 */
export function semanticCacheAllowedForPrompt(prompt: string): boolean {
  return !executiveDecisionDirective(prompt)
}
