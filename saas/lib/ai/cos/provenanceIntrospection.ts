// saas/lib/ai/cos/provenanceIntrospection.ts
//
// Compatibility entrypoint and union of prior-answer introspection classifiers.
// Natural source questions, creative-origin questions, heuristic-influence questions, and long
// technical audit requests must all route to recorded provenance rather than fresh reasoning/web.

import { asksWhereTheAnswerCameFrom } from './provenanceIntrospectionIntent.ts'
import { asksWhichHeuristicsInfluencedPriorAnswer } from './priorAnswerHeuristicIntent.ts'
import { asksForTechnicalPriorAnswerProvenance } from './technicalProvenanceIntent.ts'
import { isConversationProvenanceQuestion } from './conversationProvenanceIntent.ts'

/**
 * True when the message asks about the immediately preceding answer/artifact's origin,
 * influencing rules, or explicit execution provenance. These questions are served from recorded
 * server telemetry, never reconstructed by a model and never sent to live public search.
 */
export function isProvenanceIntrospection(input: string): boolean {
  return asksWhereTheAnswerCameFrom(input)
    || isConversationProvenanceQuestion(input)
    || asksWhichHeuristicsInfluencedPriorAnswer(input)
    || asksForTechnicalPriorAnswerProvenance(input)
}

export {
  asksWhereTheAnswerCameFrom,
  isConversationProvenanceQuestion,
  asksWhichHeuristicsInfluencedPriorAnswer,
  asksForTechnicalPriorAnswerProvenance,
}
