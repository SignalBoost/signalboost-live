// saas/lib/ai/cos/provenanceIntrospection.ts
//
// Legacy-name shim AND the union of the prior-answer introspection classifiers.
//
// Three separate detectors decide whether a message is asking about the answer COS just gave:
//   - asksForExplicitPriorAnswerProvenance (explicitProvenanceIntent.ts) — long audit/provenance prompts
//   - asksWhereTheAnswerCameFrom (provenanceIntrospectionIntent.ts) — "where did you get this?"
//   - asksWhichHeuristicsInfluencedPriorAnswer (priorAnswerHeuristicIntent.ts) — "which rules shaped that answer?"
// All must route to the recorded-provenance path, so isProvenanceIntrospection is their OR.
// Older call sites import the legacy name from this path; keep this composition stable.
//
// Do not add detection rules here. New phrasings, languages, or structural rules belong in the
// intent modules above so every caller benefits at once; this file only composes them.

import { asksForExplicitPriorAnswerProvenance } from './explicitProvenanceIntent.ts'
import { asksWhereTheAnswerCameFrom } from './provenanceIntrospectionIntent.ts'
import { asksWhichHeuristicsInfluencedPriorAnswer } from './priorAnswerHeuristicIntent.ts'

/**
 * True when the message asks about the immediately preceding answer's origin or recorded influences.
 * Such questions must be served from recorded provenance, never reconstructed by a fresh model turn.
 */
export function isProvenanceIntrospection(input: string): boolean {
  return asksForExplicitPriorAnswerProvenance(input)
    || asksWhereTheAnswerCameFrom(input)
    || asksWhichHeuristicsInfluencedPriorAnswer(input)
}

export {
  asksForExplicitPriorAnswerProvenance,
  asksWhereTheAnswerCameFrom,
  asksWhichHeuristicsInfluencedPriorAnswer,
}
