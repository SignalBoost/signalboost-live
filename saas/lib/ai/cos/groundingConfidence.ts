export type CitedKnowledgeEvidence = {
  kg: number
  cl: number
}

/**
 * Confidence credit is earned only by durable knowledge that the answer demonstrably used.
 * User-memory citations are deliberately excluded here: the prior evidence ceiling never treated
 * personal memory as factual corroboration, and this helper preserves that boundary.
 */
export function citedKnowledgeEvidenceCount(cited: CitedKnowledgeEvidence): number {
  const kg = Number.isFinite(cited.kg) ? Math.max(0, Math.floor(cited.kg)) : 0
  const cl = Number.isFinite(cited.cl) ? Math.max(0, Math.floor(cited.cl)) : 0
  return kg + cl
}

/**
 * Same evidence ceilings COS already used, but driven by cited grounding rather than context volume.
 * This removes an unearned confidence boost without lowering the model-only ceiling: a specific,
 * strong answer with no internal citations can still reach 0.78 and clear the default 0.72 gate.
 */
export function groundedEvidenceCeiling(citedEvidenceCount: number): number {
  const count = Number.isFinite(citedEvidenceCount) ? Math.max(0, Math.floor(citedEvidenceCount)) : 0
  if (count >= 5) return 0.96
  if (count >= 2) return 0.90
  if (count === 1) return 0.84
  return 0.78
}
