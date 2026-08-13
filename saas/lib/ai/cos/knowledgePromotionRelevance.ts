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

  // Retained curriculum subjects commonly use compounds such as "data-layer", "multi-tenant",
  // and "real-time" while source prose uses spaces. Treat punctuation variants as the same term;
  // otherwise the stricter promotion gate would reject relevant material for formatting alone.
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

/**
 * Second durable-memory gate for learned-corpus -> Knowledge Graph promotion.
 *
 * Continuous-learning admission asks whether a source was relevant to the question that caused the
 * study. Historical rows predate today's stricter admission rules, so a source-grounded extraction
 * alone is not sufficient: grounding proves only that a claim appears in the source, not that the
 * source belongs under the retained curriculum subject. Promotion therefore re-checks the stored
 * title/excerpt against the stored subject before COS may create structured KG facts.
 *
 * The gate is deliberately conservative. Rejecting a row here does NOT delete the learned corpus;
 * it only prevents that weakly-aligned row from becoming stronger structured knowledge. A future
 * operator can reclassify/re-study the source and promote it under a correct subject.
 */
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

  if (base.matchedAnchors.length < base.requiredMatches || base.coverage < base.minimumCoverage) {
    return result(false, 'insufficient_subject_overlap')
  }

  // Generic subject words such as "architecture", "database", "performance", and "systems" are
  // easy accidental matches in long technical/scientific documents. When the curriculum subject has
  // a more discriminative anchor, require at least one such anchor unless three independent subject
  // terms matched. This is what prevents a psychiatry paper mentioning "architecture" from becoming
  // a distributed-systems KG source while still allowing broad multi-signal technical material.
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
