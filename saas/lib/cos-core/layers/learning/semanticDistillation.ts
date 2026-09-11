import type { LearningCandidate } from './index.ts'

export const SEMANTIC_DISTILLATION_VERSION = 'semantic_v2_20260911'

const STOP_WORDS = new Set([
  'about', 'above', 'after', 'again', 'against', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'cannot', 'could', 'does', 'doing', 'down', 'during', 'each', 'from', 'further',
  'have', 'having', 'here', 'into', 'itself', 'more', 'most', 'only', 'other', 'over', 'same',
  'should', 'some', 'such', 'than', 'that', 'their', 'them', 'then', 'there', 'these', 'they',
  'this', 'those', 'through', 'under', 'until', 'very', 'were', 'what', 'when', 'where', 'which',
  'while', 'with', 'would', 'your',
])

const RELATION_MARKERS = /\b(because|therefore|thus|hence|causes?|caused|leads? to|results? in|depends? on|requires?|prevents?|enables?)\b/i
const CONDITION_MARKERS = /\b(if|unless|except|excepting|provided|provided that|when|whenever|only if|subject to)\b/i
const CONTRAST_MARKERS = /\b(however|although|though|but|despite|whereas|instead|rather than|nevertheless|nonetheless)\b/i
const NEGATION_MARKERS = /\b(no|not|never|cannot|must not|should not|without)\b/i
const NUMERIC_ANCHORS = /\b\d+(?:[.,]\d+)?%?\b/g

export type SemanticLearningFact = LearningCandidate['facts'][number]

export type SemanticDistillationResult = Readonly<{
  text: string
  sourceUnits: number
  retainedUnits: number
  duplicateUnitsRemoved: number
}>

export type DistilledSemanticKnowledge = Readonly<{
  summary: string
  facts: SemanticLearningFact[]
}>

function normalize(text: unknown): string {
  return String(text ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

function stem(term: string): string {
  if (term.length < 7) return term
  return term.replace(/(ments?|ations?|ingly|edly|ness|ings?|ers?|ies|ed|es|s)$/i, '') || term
}

function semanticTerms(text: unknown): Set<string> {
  const raw = normalize(text).toLowerCase().split(/[^\p{L}\p{N}-]+/u)
  return new Set(raw
    .map(term => term.replace(/^-+|-+$/g, '').trim())
    .filter(term => term.length >= 4 && !STOP_WORDS.has(term))
    .map(stem))
}

function overlap(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0
  let hits = 0
  for (const term of left) if (right.has(term)) hits += 1
  return hits / Math.max(1, Math.min(left.size, right.size))
}

function numericAnchors(text: string): string[] {
  return [...normalize(text).matchAll(NUMERIC_ANCHORS)].map(match => match[0].replace(',', '.')).sort()
}

/**
 * Vocabulary overlap alone is unsafe for deduplication. The sentences “access is allowed” and
 * “access is not allowed”, or “retain for 14 days” and “retain for 30 days”, can otherwise look
 * nearly identical. Distillation may remove repetition, never a semantic qualifier or conflict.
 */
function meaningCompatible(left: string, right: string): boolean {
  if (NEGATION_MARKERS.test(left) !== NEGATION_MARKERS.test(right)) return false
  if (CONDITION_MARKERS.test(left) !== CONDITION_MARKERS.test(right)) return false
  const leftNumbers = numericAnchors(left)
  const rightNumbers = numericAnchors(right)
  if (leftNumbers.length || rightNumbers.length) {
    if (leftNumbers.join('|') !== rightNumbers.join('|')) return false
  }
  return true
}

function splitMeaningUnits(text: string): string[] {
  const normalized = normalize(text)
  if (!normalized) return []
  return normalized
    .split(/(?<=[.!?])\s+|\n+/)
    .map(unit => normalize(unit))
    .filter(unit => unit.length >= 12)
}

function meaningScore(unit: string, subjectTerms: Set<string>, index: number): number {
  const unitTerms = semanticTerms(unit)
  let score = overlap(unitTerms, subjectTerms) * 8
  if (RELATION_MARKERS.test(unit)) score += 2
  if (CONDITION_MARKERS.test(unit)) score += 2.5
  if (CONTRAST_MARKERS.test(unit)) score += 2.5
  if (NEGATION_MARKERS.test(unit)) score += 2.5
  if (/\b\d+(?:\.\d+)?%?\b/.test(unit)) score += 0.75
  if (/\b(means|defined as|consists of|is a|are a|refers to)\b/i.test(unit)) score += 0.75
  if (index === 0) score += 0.25
  return score
}

/**
 * Meaning-preserving extraction, not generative summarization.
 *
 * The distiller keeps source-authored sentences, prioritizes topical relationships, conditions,
 * exceptions, negation and causal statements, removes only semantically compatible near-duplicates,
 * and restores source order. It never rewrites a claim or changes provenance. The result is safe to
 * embed and retrieve as a compact learned representation while the original source remains evidence.
 */
export function semanticDistillText(
  text: string,
  subject: string,
  options: { maxChars?: number; maxUnits?: number; duplicateThreshold?: number } = {},
): SemanticDistillationResult {
  const units = splitMeaningUnits(text)
  if (!units.length) return Object.freeze({ text: '', sourceUnits: 0, retainedUnits: 0, duplicateUnitsRemoved: 0 })

  const maxChars = Math.max(160, Math.min(4000, Math.floor(options.maxChars ?? 1200)))
  const maxUnits = Math.max(1, Math.min(16, Math.floor(options.maxUnits ?? 8)))
  const duplicateThreshold = Math.max(0.5, Math.min(0.98, options.duplicateThreshold ?? 0.78))
  const subjectTerms = semanticTerms(subject)
  const ranked = units
    .map((unit, index) => ({ unit, index, terms: semanticTerms(unit), score: meaningScore(unit, subjectTerms, index) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)

  const selected: typeof ranked = []
  let duplicates = 0
  for (const candidate of ranked) {
    if (selected.length >= maxUnits) break
    if (candidate.score <= 0 && selected.length) continue
    const duplicate = selected.some(existing =>
      meaningCompatible(candidate.unit, existing.unit)
      && overlap(candidate.terms, existing.terms) >= duplicateThreshold,
    )
    if (duplicate) {
      duplicates += 1
      continue
    }
    selected.push(candidate)
  }

  if (!selected.length) selected.push(ranked[0])
  selected.sort((a, b) => a.index - b.index)

  const retained: string[] = []
  let used = 0
  for (const { unit } of selected) {
    const separator = retained.length ? 1 : 0
    const available = maxChars - used - separator
    if (available <= 0) break
    if (unit.length <= available) {
      retained.push(unit)
      used += unit.length + separator
      continue
    }
    if (!retained.length) {
      retained.push(unit.slice(0, maxChars).trim())
      used = retained[0].length
    }
    break
  }

  return Object.freeze({
    text: retained.join(' ').trim(),
    sourceUnits: units.length,
    retainedUnits: retained.length,
    duplicateUnitsRemoved: duplicates,
  })
}

function semanticallyEquivalentFact(left: SemanticLearningFact, right: SemanticLearningFact): boolean {
  if (normalize(left.predicate).toLowerCase() !== normalize(right.predicate).toLowerCase()) return false
  if (!meaningCompatible(left.object, right.object)) return false
  return overlap(semanticTerms(left.object), semanticTerms(right.object)) >= 0.82
}

export function distillSemanticKnowledge(input: {
  subject: string
  summary: string
  facts: SemanticLearningFact[]
}): DistilledSemanticKnowledge {
  const distilled = semanticDistillText(input.summary, input.subject)
  const facts: SemanticLearningFact[] = []

  for (const fact of input.facts) {
    const duplicateIndex = facts.findIndex(existing => semanticallyEquivalentFact(existing, fact))
    if (duplicateIndex < 0) {
      facts.push(fact)
      continue
    }
    if (fact.confidence > facts[duplicateIndex].confidence) facts[duplicateIndex] = fact
  }

  return Object.freeze({
    summary: distilled.text || normalize(input.summary),
    facts: facts.length ? facts : input.facts,
  })
}

export function distillLearningCandidate(candidate: LearningCandidate): LearningCandidate {
  const distilled = distillSemanticKnowledge(candidate)
  return {
    ...candidate,
    summary: distilled.summary,
    facts: distilled.facts,
  }
}
