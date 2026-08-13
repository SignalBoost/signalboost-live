import { discriminativeDomainAnchors, distinctTerms, matchesTerm } from '@/lib/cos-core/layers/learning/cycle'
import { minimumConfidenceForKind } from '@/lib/cos-core/layers/learning/sourceCatalog'

export type KnowledgePromotionCandidate = {
  sourceKind: string
  subject: string
  summary: string
  sourceTitle?: string | null
  confidence: number
}

export type KnowledgePromotionRelevanceDecision = {
  eligible: boolean
  reason: 'eligible' | 'missing_subject' | 'missing_evidence' | 'below_source_confidence_floor' | 'insufficient_subject_overlap' | 'missing_discriminative_subject_anchor'
  anchors: string[]
  matchedAnchors: string[]
  discriminativeAnchors: string[]
  discriminativeMatched: string[]
  coverage: number
  requiredMatches: number
  minimumCoverage: number
  confidence: number
  confidenceFloor: number
}

type RelevanceOptions = {
  minSubjectMatches?: number
  minSubjectCoverage?: number
}

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name])
  return Number.isFinite(raw) && raw >= min && raw <= max ? raw : fallback
}

export function minimumKnowledgePromotionSubjectMatches(): number {
  return Math.round(envNumber('COS_KG_PROMOTION_MIN_SUBJECT_MATCHES', 2, 1, 8))
}

export function minimumKnowledgePromotionSubjectCoverage(): number {
  return envNumber('COS_KG_PROMOTION_MIN_SUBJECT_COVERAGE', 0.3, 0, 1)
}

function promotionTermMatches(haystack: string, term: string): boolean {
  if (matchesTerm(haystack, term)) return true
  const spaced = term.replace(/[-_]+/g, ' ')
  if (spaced !== term && matchesTerm(haystack, spaced)) return true
  const compactTerm = term.replace(/[-_\s]+/g, '')
  if (compactTerm.length < 4) return false
  const compactHaystack = haystack.replace(/[-_\s]+/g, '')
  return compactTerm !== term && matchesTerm(compactHaystack, compactTerm)
}

function confidenceFloor(sourceKind: string): number {
  const floor = minimumConfidenceForKind(sourceKind as Parameters<typeof minimumConfidenceForKind>[0])
  return floor ?? 0.72
}

function decisionBase(candidate: KnowledgePromotionCandidate, options?: RelevanceOptions) {
  const anchors = distinctTerms(candidate.subject).slice(0, 8)
  const haystack = `${candidate.sourceTitle ?? ''} ${candidate.summary ?? ''}`.toLowerCase()
  const matchedAnchors = anchors.filter(term => promotionTermMatches(haystack, term))
  const discriminativeAnchors = discriminativeDomainAnchors(anchors)
  const matched = new Set(matchedAnchors)
  const discriminativeMatched = discriminativeAnchors.filter(term => matched.has(term))
  const configuredMatches = Math.max(1, Math.round(options?.minSubjectMatches ?? minimumKnowledgePromotionSubjectMatches()))
  const requiredMatches = anchors.length ? Math.min(anchors.length, configuredMatches) : 0
  const minimumCoverage = Math.max(0, Math.min(1, options?.minSubjectCoverage ?? minimumKnowledgePromotionSubjectCoverage()))
  const coverage = anchors.length ? matchedAnchors.length / anchors.length : 0
  const confidence = Number.isFinite(candidate.confidence) ? Math.max(0, Math.min(1, candidate.confidence)) : 0
  return {
    anchors,
    matchedAnchors,
    discriminativeAnchors,
    discriminativeMatched,
    coverage,
    requiredMatches,
    minimumCoverage,
    confidence,
    confidenceFloor: confidenceFloor(candidate.sourceKind),
  }
}

export function evaluateKnowledgePromotionRelevance(
  candidate: KnowledgePromotionCandidate,
  options?: RelevanceOptions,
): KnowledgePromotionRelevanceDecision {
  const base = decisionBase(candidate, options)
  const result = (eligible: boolean, reason: KnowledgePromotionRelevanceDecision['reason']): KnowledgePromotionRelevanceDecision => ({
    eligible,
    reason,
    ...base,
    coverage: Number(base.coverage.toFixed(3)),
  })

  if (!candidate.subject.trim() || base.anchors.length === 0) return result(false, 'missing_subject')
  if (!candidate.summary.trim() && !String(candidate.sourceTitle ?? '').trim()) return result(false, 'missing_evidence')
  if (base.confidence < base.confidenceFloor) return result(false, 'below_source_confidence_floor')

  // Generic curriculum terms are context, not evidence. For a short subject such as
  // "Enterprise cybersecurity", demanding both words rejects a strong cybersecurity source simply
  // because it does not repeat the generic word "enterprise". Permit the configured match-count
  // shortfall only when every available discriminative anchor is actually present. Generic-only
  // matches do NOT get this exception, so the historical lung/psychiatry contamination cases retain
  // their existing insufficient-overlap rejection semantics.
  const discriminativeException =
    base.discriminativeAnchors.length > 0 &&
    base.discriminativeMatched.length === base.discriminativeAnchors.length &&
    base.discriminativeMatched.length < base.requiredMatches &&
    base.coverage >= base.minimumCoverage

  if ((base.matchedAnchors.length < base.requiredMatches || base.coverage < base.minimumCoverage) && !discriminativeException) {
    return result(false, 'insufficient_subject_overlap')
  }

  if (
    base.discriminativeAnchors.length > 0 &&
    base.discriminativeMatched.length === 0 &&
    base.matchedAnchors.length < Math.min(3, base.anchors.length)
  ) {
    return result(false, 'missing_discriminative_subject_anchor')
  }

  return result(true, 'eligible')
}

export function knowledgePromotionRelevanceMessage(decision: KnowledgePromotionRelevanceDecision): string {
  const matched = decision.matchedAnchors.length ? decision.matchedAnchors.join(',') : 'none'
  const discriminative = decision.discriminativeMatched.length ? decision.discriminativeMatched.join(',') : 'none'
  return `promotion relevance gate: ${decision.reason}; subject matches ${decision.matchedAnchors.length}/${decision.anchors.length} (${matched}); coverage ${decision.coverage.toFixed(2)} >= ${decision.minimumCoverage.toFixed(2)}; discriminative matches ${discriminative}; confidence ${decision.confidence.toFixed(2)} >= ${decision.confidenceFloor.toFixed(2)}`
}
