// saas/lib/ai/cos/provenanceIntrospection.ts
//
// Legacy-name shim AND the union of the prior-answer introspection classifiers.
//
// Two separate detectors decide whether a message is asking about the answer COS just gave:
//   - asksWhereTheAnswerCameFrom  (provenanceIntrospectionIntent.ts) — "where did you get this?"
//   - asksWhichHeuristicsInfluencedPriorAnswer (priorAnswerHeuristicIntent.ts) — "which rules
//     shaped that answer?"
// Both must route to the recorded-provenance path, so isProvenanceIntrospection is their OR.
// Older call sites (cosOrchestrationEnterprise, and cosOrchestrationLive through it) import the
// legacy name from this path, which is why this file exists rather than the callers importing
// each detector directly.
//
// Do not add detection rules here. New phrasings, languages, or structural rules belong in the
// two intent modules above so every caller benefits at once; this file only composes them.

import { asksWhereTheAnswerCameFrom } from './provenanceIntrospectionIntent.ts'
import { asksWhichHeuristicsInfluencedPriorAnswer } from './priorAnswerHeuristicIntent.ts'

/**
 * True when the message asks about the immediately preceding answer's origin OR about the rules
 * that shaped it. Either question must be served from recorded provenance, never reconstructed.
 */
export function isProvenanceIntrospection(input: string): boolean {
  return asksWhereTheAnswerCameFrom(input) || asksWhichHeuristicsInfluencedPriorAnswer(input)
}

export { asksWhereTheAnswerCameFrom, asksWhichHeuristicsInfluencedPriorAnswer }
