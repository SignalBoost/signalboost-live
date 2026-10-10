import { classifyTemporalSensitivity } from './temporalClaimGuard.ts'
import { authorityTierOf, classifyAuthoritativeSourceNeed } from './officialSourceAuthority.ts'
import {
  freshEvidenceHost,
  freshEvidenceMeetsAuthority,
  replyCitesIndependentFreshEvidence,
  requiresIndependentCorroboration,
  requiresOfficeHolderAuthority,
  type FreshEvidenceSource,
} from './cosFreshGrounding.ts'
import { isInstitutionalHost } from './officialSourceAuthority.ts'

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

export type FreshCitationRequirement = {
  /** Independent hosts the reply must cite unless an official publisher is cited. */
  minIndependentHosts: 1 | 2
  /** A single cited institutional/official publisher satisfies the requirement on its own. */
  officialPublisherSufficient: boolean
  /** Retrieved sources that are institutional/official publishers, if any. */
  officialSourceIds: string[]
}

/**
 * The SAME policy the citation validator enforces, expressed for the reasoner. The host must tell
 * the model what release requires; a requirement the model cannot see is not a verification step,
 * it is a trap (2026-10-10: every public-office answer that cited one of two retrieved reports was
 * rejected for a rule the prompt never stated).
 */
export function freshCitationRequirement(input: string, sources: FreshEvidenceSource[]): FreshCitationRequirement {
  const officialSourceIds = sources
    .filter(source => isInstitutionalHost(freshEvidenceHost(source.url)))
    .map(source => source.id)
  if (requiresOfficeHolderAuthority(input)) {
    return { minIndependentHosts: 2, officialPublisherSufficient: true, officialSourceIds }
  }
  if (requiresIndependentCorroboration(input) || isLifeStatusQuestion(input)) {
    return { minIndependentHosts: 2, officialPublisherSufficient: false, officialSourceIds }
  }
  return { minIndependentHosts: 1, officialPublisherSufficient: false, officialSourceIds }
}

export function describeFreshCitationRequirement(requirement: FreshCitationRequirement, sources: FreshEvidenceSource[]): string {
  const hosts = new Map<string, string[]>()
  for (const source of sources) {
    const host = freshEvidenceHost(source.url)
    if (!host) continue
    hosts.set(host, [...(hosts.get(host) ?? []), source.id])
  }
  const hostList = [...hosts.entries()].map(([host, ids]) => `${ids.join('/')}=${host}`).join(', ')
  if (requirement.minIndependentHosts === 1) {
    return `Cite every evidence id you rely on; at least one is required. Hosts: ${hostList}.`
  }
  const official = requirement.officialPublisherSufficient && requirement.officialSourceIds.length
    ? ` Citing the official publisher (${requirement.officialSourceIds.join(', ')}) is sufficient on its own.`
    : ''
  return `This question requires corroboration: cite evidence ids from at least TWO different hosts that support the same point.${official} Hosts: ${hostList}.`
}
