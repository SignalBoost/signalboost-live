// saas/lib/ai/cos/provenanceIntrospection.ts
//
// Compatibility entrypoint and union of prior-answer introspection classifiers.
// Natural source questions, creative-origin questions, heuristic-influence questions, and long
// technical audit requests must all route to recorded provenance rather than fresh reasoning/web.

import { asksWhereTheAnswerCameFrom } from './provenanceIntrospectionIntent.ts'
import { asksWhichHeuristicsInfluencedPriorAnswer } from './priorAnswerHeuristicIntent.ts'
import { asksForTechnicalPriorAnswerProvenance } from './technicalProvenanceIntent.ts'
import { isConversationProvenanceQuestion } from './conversationProvenanceIntent.ts'

// A pasted runtime/build log is user-supplied evidence to analyze, never a question about
// COS's preceding answer. Its incidental words must not trigger the provenance-only route.
const PASTED_OPERATIONAL_LOG = /(?:^\d{2}:\d{2}:\d{2}\.\d{3}\s+(?:running|cloning|installing|restored)\b|\b(?:running|cloning|installing|restored build cache)\b[\s\S]{0,160}\b(?:vercel|next\.js|npm|node)\b|\bvercel cli\s+\d)/im

/**
 * True when the message asks about the immediately preceding answer/artifact's origin,
 * influencing rules, or explicit execution provenance. These questions are served from recorded
 * server telemetry, never reconstructed by a model and never sent to live public search.
 */
export function isProvenanceIntrospection(input: string): boolean {
  if (PASTED_OPERATIONAL_LOG.test(String(input || ''))) return false
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
