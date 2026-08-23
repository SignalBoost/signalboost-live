// saas/lib/ai/cos/provenanceIntrospection.ts
//
// Compatibility entrypoint and union of prior-answer introspection classifiers.
// Natural source questions, heuristic-influence questions, and long technical audit requests must
// all route to the recorded-provenance path rather than fresh reasoning or web search.

import { asksWhereTheAnswerCameFrom } from './provenanceIntrospectionIntent.ts'
import { asksWhichHeuristicsInfluencedPriorAnswer } from './priorAnswerHeuristicIntent.ts'
import { asksForTechnicalPriorAnswerProvenance } from './technicalProvenanceIntent.ts'

/**
 * True when the message asks about the immediately preceding answer's origin, influencing rules,
 * or explicit execution provenance. These questions are served from recorded server telemetry,
 * never reconstructed by a model.
 */
export function isProvenanceIntrospection(input: string): boolean {
  return asksWhereTheAnswerCameFrom(input)
    || asksWhichHeuristicsInfluencedPriorAnswer(input)
    || asksForTechnicalPriorAnswerProvenance(input)
}

export {
  asksWhereTheAnswerCameFrom,
  asksWhichHeuristicsInfluencedPriorAnswer,
  asksForTechnicalPriorAnswerProvenance,
}
