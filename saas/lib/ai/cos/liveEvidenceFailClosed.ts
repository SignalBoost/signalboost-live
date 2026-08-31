import { classifyAuthoritativeSourceNeed } from './officialSourceAuthority.ts'
import { classifyTemporalSensitivity } from './temporalClaimGuard.ts'
import { structuredLiveDataKind } from './cosFreshnessPolicy.ts'

/**
 * Fail closed only when live evidence is actually required to avoid a stale or
 * unowned claim. A dead search provider must not turn "capital of France" into
 * an unavailable banner. Official statistics, regulated guidance, office holders,
 * life status, and priced/live feeds still refuse rather than use model memory.
 */
export function mustFailClosedWithoutAuthoritativeLiveEvidence(input: string): boolean {
  const text = String(input || '')
  if (classifyAuthoritativeSourceNeed(text).required) return true
  if (classifyTemporalSensitivity(text).sensitive) return true
  if (structuredLiveDataKind(text)) return true
  return false
}
