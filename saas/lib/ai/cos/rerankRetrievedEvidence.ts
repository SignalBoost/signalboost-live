import { formatRankedEvidence, rankEvidence, type RankedEvidence } from '@/lib/ai/cos/evidenceRanking'

type SafeText = (value: unknown, max?: number) => string

type FactRow = { subject:unknown; predicate:unknown; object:unknown; confidence:unknown; source:unknown }
type LearnedRow = { subject:unknown; summary:unknown; facts:unknown; confidence:unknown; source_kind:unknown; source_uri:unknown }
type MemoryRow = { kind?:unknown; content?:unknown }

export type RerankedInternalEvidence = {
  facts: string[]
  learned: string[]
  memories: string[]
  evidenceCount: number
  highRelevanceCount: number
  meanRelevance: number
}

function metrics(groups: RankedEvidence[][]): Pick<RerankedInternalEvidence, 'evidenceCount'|'highRelevanceCount'|'meanRelevance'> {
  const all = groups.flat()
  const evidenceCount = all.length
  const highRelevanceCount = all.filter(item => item.relevance >= 0.42).length
  const meanRelevance = evidenceCount ? all.reduce((sum, item) => sum + item.relevance, 0) / evidenceCount : 0
  return { evidenceCount, highRelevanceCount, meanRelevance }
}

export function rerankRetrievedEvidence(
  prompt: string,
  facts: FactRow[],
  learned: LearnedRow[],
  memories: MemoryRow[],
  safeText: SafeText,
): RerankedInternalEvidence {
  const factCandidates = facts.map((r, i) => ({
    id: `KG${i + 1}`,
    text: `${safeText(r.subject,180)} — ${safeText(r.predicate,120)} — ${safeText(r.object,600)}`,
    confidence: Number(r.confidence || 0),
    source: safeText(r.source,180) || 'knowledge-graph',
  }))
  const learnedCandidates = learned.map((r, i) => {
    const extracted = Array.isArray(r.facts) ? r.facts.slice(0,4).map((f:unknown)=>safeText(f,300)).join('; ') : ''
    return {
      id: `CL${i + 1}`,
      text: `${safeText(r.subject,180)}: ${safeText(r.summary,800)}${extracted ? ` Facts: ${extracted}` : ''}`,
      confidence: Number(r.confidence || 0),
      source: `${safeText(r.source_kind,80)} ${safeText(r.source_uri,280)}`.trim() || 'continuous-learning',
    }
  })
  const memoryCandidates = memories.map((r, i) => ({
    id: `EM${i + 1}`,
    text: `[${safeText(r.kind,60) || 'memory'}] ${safeText(r.content,500)}`,
    confidence: 0.80,
    source: 'user-enterprise-memory',
  }))

  const rankedFacts = rankEvidence(prompt, factCandidates, 8)
  const rankedLearned = rankEvidence(prompt, learnedCandidates, 8)
  const rankedMemories = rankEvidence(prompt, memoryCandidates, 6)

  return {
    facts: formatRankedEvidence(rankedFacts),
    learned: formatRankedEvidence(rankedLearned),
    memories: formatRankedEvidence(rankedMemories),
    ...metrics([rankedFacts, rankedLearned, rankedMemories]),
  }
}

export function evidenceConfidenceCeiling(evidence: Pick<RerankedInternalEvidence, 'evidenceCount'|'highRelevanceCount'|'meanRelevance'>): number {
  if (evidence.highRelevanceCount >= 5 && evidence.meanRelevance >= 0.40) return 0.96
  if (evidence.highRelevanceCount >= 2 && evidence.meanRelevance >= 0.32) return 0.90
  if (evidence.evidenceCount >= 1 && evidence.meanRelevance >= 0.26) return 0.84
  return 0.78
}
