// saas/lib/ai/cos/provenanceIntrospection.ts
//
// Compatibility surface for prior-answer introspection detection.
//
// Source-origin questions and questions about which heuristics/rules shaped the prior answer both
// belong on the same server-recorded provenance path. Neither may be reconstructed by a fresh model
// turn, because a new retrieval or prompt can differ from what actually produced the earlier answer.

import { asksWhereTheAnswerCameFrom } from './provenanceIntrospectionIntent.ts'
import { asksWhichHeuristicsInfluencedPriorAnswer } from './priorAnswerHeuristicIntent.ts'

export { asksWhereTheAnswerCameFrom, asksWhichHeuristicsInfluencedPriorAnswer }

/** True only for a request to introspect the recorded origin or influences of a prior answer. */
export function isProvenanceIntrospection(input: string): boolean {
  return asksWhereTheAnswerCameFrom(input) || asksWhichHeuristicsInfluencedPriorAnswer(input)
}
