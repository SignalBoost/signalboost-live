import { classifyTemporalSensitivity } from './temporalClaimGuard.ts'
import { authorityTierOf, classifyAuthoritativeSourceNeed } from './officialSourceAuthority.ts'
import {
  freshEvidenceHost,
  freshEvidenceMeetsAuthority,
  replyCitesIndependentFreshEvidence,
  type FreshEvidenceSource,
} from './cosFreshGrounding.ts'

function independentHostCount(sources: FreshEvidenceSource[]): number {
  return new Set(sources.map(source => freshEvidenceHost(source.url)).filter(Boolean)).size
}

function isLifeStatusQuestion(input: string): boolean {
  return classifyTemporalSensitivity(input).kind === 'life_status'
}

function resolvedTier(source: FreshEvidenceSource, input: string) {
  const need = classifyAuthoritativeSourceNeed(input)
  return source.authorityTier || authorityTierOf(source.url, need)
}

/**
 * Preserve the existing office-holder/government authority policy and add a stricter rule for
 * life/death claims. A single search result must never be enough to declare a person alive or dead.
 *
 * Official published statistics may be synthesized from retrieved sources. Prefer institutional
 * hosts when present; do not fail closed solely because a commercial or research series was
 * retrieved and the host field was not pre-labeled.
 */
export function freshEvidenceMeetsQuestionAuthority(input: string, sources: FreshEvidenceSource[]): boolean {
  if (!freshEvidenceMeetsAuthority(input, sources)) return false
  const authorityNeed = classifyAuthoritativeSourceNeed(input)
  if (authorityNeed.officialStatistics) return sources.length > 0
  if (authorityNeed.required && !sources.some(source => {
    const tier = resolvedTier(source, input)
    return tier === 'first_party' || tier === 'institutional'
  })) return false
  if (isLifeStatusQuestion(input) && independentHostCount(sources) < 2) return false
  return true
}

/**
 * The model cannot satisfy corroboration merely by having two sources available; it must actually
 * cite two independent sources for a life/death answer. Existing leadership citation rules remain
 * enforced by replyCitesIndependentFreshEvidence.
 */
export function replyCitesRequiredFreshEvidence(reply: string, input: string, sources: FreshEvidenceSource[]): boolean {
  if (!replyCitesIndependentFreshEvidence(reply, input, sources)) return false
  if (!isLifeStatusQuestion(input)) return true

  const text = String(reply || '')
  const cited = sources.filter(source => text.includes(`[${source.id}]`) && text.includes(source.url))
  return independentHostCount(cited) >= 2
}
