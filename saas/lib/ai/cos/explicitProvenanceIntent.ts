// Long, explicit prior-answer provenance requests should never fall through to a fresh model turn.
//
// Natural source questions are handled by provenanceIntrospectionIntent.ts, which deliberately caps
// free-form input length to avoid swallowing long topical source requests. Power users and audit
// workflows often ask a much longer, technical question that explicitly names provenance systems.
// This detector covers only that narrow, high-signal shape.

const EXPLICIT_PROVENANCE_TERMS = [
  /\bcomplete\s+provenance\b/i,
  /\bprovenance\s+report\b/i,
  /\bprimary\s+model\b/i,
  /\bexecution\s+telemetry\b/i,
  /\bmaterially\s+contribut(?:e|ed|ing)\b/i,
  /\bsemantic\s+cache\b/i,
  /\benterprise\s+memory\b/i,
  /\bknowledge\s+graph\b/i,
  /\blearned\s+corpus\b/i,
  /\bautonomous\s+research\b/i,
  /\blocal\s+reasoning\s+engine\b/i,
  /\bexternal\s+ai\s+provider\b/i,
]

const PRIOR_ANSWER_REFERENT =
  /\b(?:answer|response|reply)\b[^\n]{0,120}\b(?:just|previous|prior|last)\b|\b(?:just|previous|prior|last)\b[^\n]{0,120}\b(?:answer|response|reply)\b/i

export function asksForExplicitPriorAnswerProvenance(input: string): boolean {
  const text = String(input ?? '').trim().slice(0, 12_000)
  if (!text || !PRIOR_ANSWER_REFERENT.test(text)) return false
  let signals = 0
  for (const pattern of EXPLICIT_PROVENANCE_TERMS) if (pattern.test(text)) signals += 1
  // Two independent technical signals plus a prior-answer referent is intentionally strict.
  return signals >= 2
}
