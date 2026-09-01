import type { FreshEvidenceSource } from './cosFreshGrounding.ts'
import { isNormativePolicyQuestion } from './normativeAnswerPolicy.ts'

/**
 * A retrieved result is evidence input, never a completed answer.
 *
 * This compatibility boundary intentionally returns null. Earlier behavior copied search-result
 * titles and snippets into a public reply when local synthesis failed, which exposed navigation
 * debris and institutional framing without relevance judgment or synthesis. Callers must continue
 * through their ordinary failed-closed path after bounded local synthesis attempts are exhausted.
 */
export function buildNormativeFreshEvidenceFallback(args: {
  input: string
  sources: FreshEvidenceSource[]
  language: string
}): string | null {
  void args.language
  if (!isNormativePolicyQuestion(args.input) || !args.sources.length) return null
  return null
}
