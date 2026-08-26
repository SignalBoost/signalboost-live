export const OWNER_DIRECTED_STUDY_MARKER = 'owner_directed_study'
export const OWNER_DIRECTED_INTENT_MARKER = 'admission_basis:owner_directed_intent'

/**
 * Directed Study writes both markers together. Requiring the pair prevents an unrelated historical
 * evidence value from accidentally gaining owner-directed promotion authority.
 */
export function ownerDirectedPromotionAuthority(evidence: unknown): boolean {
  if (!Array.isArray(evidence)) return false
  const markers = new Set(evidence.map(value => String(value ?? '').trim()))
  return markers.has(OWNER_DIRECTED_STUDY_MARKER) && markers.has(OWNER_DIRECTED_INTENT_MARKER)
}
