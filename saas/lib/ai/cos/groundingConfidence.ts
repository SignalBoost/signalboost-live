import { evidenceMismatchConfidenceCapActive } from './advisoryDiagnosisIntent.ts'

export type CitedKnowledgeEvidence = {
  kg: number
  cl: number
  /** Organization-scoped Enterprise Memory citations. Saved user memory remains excluded. */
  oem?: number
}

/**
 * Confidence credit is earned only by durable factual knowledge that the answer demonstrably used.
 * Saved per-user memory is deliberately excluded; organization-scoped Enterprise Memory is factual
 * internal evidence and therefore earns the same bounded grounding credit as KG/corpus evidence.
 */
export function citedKnowledgeEvidenceCount(cited: CitedKnowledgeEvidence): number {
  const kg = Number.isFinite(cited.kg) ? Math.max(0, Math.floor(cited.kg)) : 0
  const cl = Number.isFinite(cited.cl) ? Math.max(0, Math.floor(cited.cl)) : 0
  const oem = Number.isFinite(cited.oem) ? Math.max(0, Math.floor(cited.oem ?? 0)) : 0
  return kg + cl + oem
}

export function groundedEvidenceCeiling(citedEvidenceCount: number): number {
  // Power / lever vignettes currently retrieve off-domain KG (memory scrubbing).
  // Those citations must not earn the 0.90 publish ceiling.
  if (evidenceMismatchConfidenceCapActive()) return 0.30
  const count = Number.isFinite(citedEvidenceCount) ? Math.max(0, Math.floor(citedEvidenceCount)) : 0
  if (count >= 5) return 0.96
  if (count >= 2) return 0.90
  if (count === 1) return 0.84
  return 0.78
}
