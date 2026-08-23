// Detect explicit, technical requests for the recorded provenance of COS's immediately preceding answer.
// This path is deliberately separate from the short natural-language "where did you get that?" detector:
// audit-style requests are often much longer than 300 characters and name telemetry components directly.

const PRIOR_ANSWER = /\b(?:answer|response|reply|output)\b[\s\S]{0,90}\b(?:just|previous|prior|last|you\s+(?:just\s+)?(?:gave|provided|generated|returned))\b|\b(?:answer|response|reply|output)\s+you\s+(?:just\s+)?(?:gave|provided|generated|returned)\b/i
const TECHNICAL_PROVENANCE = /\b(?:provenance|execution\s+telemetry|execution\s+logs?|answer\s+origin|lineage|primary\s+model|reasoning\s+engine|semantic\s+cache|enterprise\s+memory|knowledge\s+graph|learned\s+corpus|autonomous\s+research|external\s+ai\s+provider|internal\s+systems?)\b/i
const REQUEST = /\b(?:show|give|provide|list|identify|state|report|display|explain|complete|enumerate|tell\s+me)\b/i

/**
 * True only when a technical provenance request is tied to the assistant's immediately preceding
 * answer. General questions such as "explain provenance systems" or "what is a semantic cache?"
 * remain ordinary content questions.
 */
export function asksForTechnicalPriorAnswerProvenance(input: string): boolean {
  const text = String(input || '').trim()
  if (!text || text.length > 4000) return false
  return PRIOR_ANSWER.test(text) && TECHNICAL_PROVENANCE.test(text) && REQUEST.test(text)
}
