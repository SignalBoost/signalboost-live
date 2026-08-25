// saas/lib/ai/cos/provenanceIntrospection.ts
//
// Compatibility entrypoint and union of prior-answer introspection classifiers.
// Natural source questions, heuristic-influence questions, and long technical audit requests must
// all route to the recorded-provenance path rather than fresh reasoning or web search.

import { asksWhereTheAnswerCameFrom } from './provenanceIntrospectionIntent.ts'
import { asksWhichHeuristicsInfluencedPriorAnswer } from './priorAnswerHeuristicIntent.ts'
import { asksForTechnicalPriorAnswerProvenance } from './technicalProvenanceIntent.ts'
import { isConversationProvenanceQuestion } from './conversationProvenanceIntent.ts'

/**
 * True when the message asks about the immediately preceding answer's origin, influencing rules,
 * or explicit execution provenance. These questions are served from recorded server telemetry,
 * never reconstructed by a model.
 */
export function isProvenanceIntrospection(input: string): boolean {
  return asksWhereTheAnswerCameFrom(input)
    || asksWhichHeuristicsInfluencedPriorAnswer(input)
    || asksForTechnicalPriorAnswerProvenance(input)
    // ARTIFACT REFERENTS. 2026-08-25: "where did you get the IDEA from?", asked about a comedy
    // script COS had just written, matched nothing here and fell through to live verification,
    // which then emitted the fresh-evidence restriction template — a message asserting a retrieval
    // that never happened. The classifiers above require an ANSWER noun (answer/response/reply) or
    // a demonstrative; "the idea", "the script", "the text" are none of those. This clause matches
    // on structure instead — origin interrogative + in-conversation referent — so the noun the user
    // happens to choose stops deciding the route.
    || isConversationProvenanceQuestion(input)
}

export {
  asksWhereTheAnswerCameFrom,
  asksWhichHeuristicsInfluencedPriorAnswer,
  asksForTechnicalPriorAnswerProvenance,
}
