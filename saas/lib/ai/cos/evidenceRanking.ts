// saas/lib/ai/cos/evidenceRanking.ts

const EVIDENCE_STOP_WORDS = new Set([
  'about','after','again','also','because','before','being','could','does','from','have','into','more','most','should','that','their','there','these','they','this','those','through','under','what','when','where','which','while','with','would','your','you','and','the','for','are','how','why',
])

export type EvidenceCandidate = {
  id: string
  text: string
  confidence: number
  source: string
}

export type RankedEvidence = EvidenceCandidate & {
  relevance: number
  matchedTerms: string[]
}

function terms(value: string): string[] {
  return [...new Set(value.toLowerCase().replace(/[^a-z0-9\s_-]/g, ' ').split(/\s+/).map(v => v.trim()).filter(v => v.length >= 4 && !EVIDENCE_STOP_WORDS.has(v)))]
}

export function rankEvidence(prompt: string, candidates: EvidenceCandidate[], limit: number): RankedEvidence[] {
  const promptTerms = terms(prompt)
  if (!promptTerms.length) return []
  const promptSet = new Set(promptTerms)
  return candidates
    .map(candidate => {
      const candidateTerms = terms(candidate.text)
      const matchedTerms = [...new Set(candidateTerms.filter(term => promptSet.has(term)))]
      const coverage = matchedTerms.length / promptTerms.length
      const precision = candidateTerms.length ? matchedTerms.length / Math.min(candidateTerms.length, 24) : 0
      const confidence = Math.max(0, Math.min(1, Number(candidate.confidence) || 0))
      // Relevance dominates; confidence only breaks ties between genuinely related evidence.
      const relevance = coverage * 0.68 + Math.min(1, precision * 4) * 0.22 + confidence * 0.10
      return { ...candidate, relevance, matchedTerms }
    })
    // One accidental keyword is not enough to become evidence. Two terms are accepted even
    // for long prompts; otherwise require at least a quarter of the user's meaningful terms.
    .filter(item => item.matchedTerms.length >= Math.min(2, promptTerms.length) || item.relevance >= 0.34)
    .sort((a, b) => b.relevance - a.relevance || b.confidence - a.confidence)
    .slice(0, limit)
}

export function formatRankedEvidence(items: RankedEvidence[]): string[] {
  return items.map(item => `[${item.id}] ${item.text} [relevance ${item.relevance.toFixed(2)}; confidence ${item.confidence.toFixed(2)}; source ${item.source}]`)
}
