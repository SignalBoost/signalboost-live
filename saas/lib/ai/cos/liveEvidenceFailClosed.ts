import { classifyAuthoritativeSourceNeed } from './officialSourceAuthority.ts'
import { classifyTemporalSensitivity } from './temporalClaimGuard.ts'
import { structuredLiveDataKind } from './cosFreshnessPolicy.ts'

const EXPLICIT_OFFICIAL_SERIES_READING = /\b(?:current|currently|latest|today|now|this\s+(?:week|month|quarter|year)|20\d{2}|median|mean|average|rate|percent(?:age)?|ratio|weekly|hourly|annual|monthly|quarterly|seasonally\s+adjusted|index|series)\b/i

/**
 * Fail closed only when live evidence is actually required to avoid a stale or
 * unowned claim. A dead search provider must not turn a stable or broad question
 * into an unavailable banner.
 *
 * Official-statistics topics get a narrower treatment than regulations or other
 * owned facts. An explicit current/quantitative series request still requires the
 * owning statistical publisher and fails closed on a live miss. A broad umbrella
 * question (for example whether a population "gap" exists without choosing a
 * measure, denominator, controls, or causal reading) may continue to the local
 * reasoner when live retrieval is unavailable. That reasoner must not invent a
 * current statistic; the existing semantic-scope and neutrality contracts keep
 * descriptive measurements separate from causal, discriminatory, or legal claims.
 */
export function mustFailClosedWithoutAuthoritativeLiveEvidence(input: string): boolean {
  const text = String(input || '')
  const authorityNeed = classifyAuthoritativeSourceNeed(text)
  if (authorityNeed.required) {
    if (!authorityNeed.officialStatistics) return true
    if (EXPLICIT_OFFICIAL_SERIES_READING.test(text)) return true
  }
  if (classifyTemporalSensitivity(text).sensitive) return true
  if (structuredLiveDataKind(text)) return true
  return false
}
