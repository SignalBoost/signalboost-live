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

const POWER_CONTEXT = /(?:\b\d+(?:\.\d+)?\s*(?:mw|kw)\b|\b(?:power|electrical|pdu|breaker|power-cap|power cap|power transient)\b)/i
const LEVER_FAMILIES = [
  /\bdvfs\b|dynamic voltage|frequency scaling/i,
  /packet\s+pac(?:e|ing)|top[- ]of[- ]rack|\btor\b/i,
  /checkpoint|preempt(?:ing|ion)|job\s+preempt/i,
]

const POWER_EVIDENCE = /(?:\b(?:power|watts?|wattage|megawatts?|kilowatts?|pdu|breaker|dvfs|telemetry|electrical|voltage|energy)\b|power[- ]cap|power\s+limit|packet\s+pac(?:e|ing)|top[- ]of[- ]rack|\btor\b|checkpoint|preempt(?:ing|ion)|load\s+shedding|rail\s+power|thermal\s+breaker)/i

function normalized(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Narrow production guard for the observed power/lever evidence-mismatch class.
 *
 * This function is deliberately pure: no module-global "last prompt" state and therefore no
 * possibility that one concurrent request changes another request's confidence. A caller that can
 * map citations back to their exact KG/CL/OEM rows should pass those rows in citedEvidence. Until
 * that mapping is supplied, the target class fails safe: it cannot earn a high grounding ceiling
 * merely because an unrelated citation count is non-zero.
 */
export function evidenceMismatchConfidenceCapActive(
  prompt: unknown,
  citedEvidence: readonly string[] = [],
): boolean {
  const request = normalized(prompt)
  if (!request || !POWER_CONTEXT.test(request)) return false

  const leverFamilies = LEVER_FAMILIES.filter(pattern => pattern.test(request)).length
  if (leverFamilies < 2) return false

  const exactCitedEvidence = (Array.isArray(citedEvidence) ? citedEvidence : [])
    .map(normalized)
    .filter(Boolean)

  return !exactCitedEvidence.some(item => POWER_EVIDENCE.test(item))
}

export function groundedEvidenceCeiling(
  citedEvidenceCount: number,
  prompt?: unknown,
  citedEvidence: readonly string[] = [],
): number {
  // The observed 1.2 MW / DVFS / ToR-pacing / checkpoint class retrieved off-domain GPU-memory
  // security evidence. Unrelated citations must not turn that answer into a 0.90-confidence plant
  // procedure. Keep the existing low-confidence/escalation path by capping this mismatch at 0.30.
  if (evidenceMismatchConfidenceCapActive(prompt, citedEvidence)) return 0.30

  const count = Number.isFinite(citedEvidenceCount) ? Math.max(0, Math.floor(citedEvidenceCount)) : 0
  if (count >= 5) return 0.96
  if (count >= 2) return 0.90
  if (count === 1) return 0.84
  return 0.78
}
