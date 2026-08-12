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

export function evidenceTerms(value: string): string[] {
  return [...new Set(
    value
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, ' ')
      .split(/\s+/u)
      .map(v => v.trim())
      .filter(v => v.length >= 3 && !EVIDENCE_STOP_WORDS.has(v)),
  )]
}

export function rankEvidence(prompt: string, candidates: EvidenceCandidate[], limit: number): RankedEvidence[] {
  const promptTerms = evidenceTerms(prompt)
  if (!promptTerms.length) return []
  const promptSet = new Set(promptTerms)
  return candidates
    .map(candidate => {
      const candidateTerms = evidenceTerms(candidate.text)
      const matchedTerms = [...new Set(candidateTerms.filter(term => promptSet.has(term)))]
      const coverage = matchedTerms.length / promptTerms.length
      const precision = candidateTerms.length ? matchedTerms.length / Math.min(candidateTerms.length, 24) : 0
      const confidence = Math.max(0, Math.min(1, Number(candidate.confidence) || 0))
      // Relevance dominates; source confidence only breaks ties between genuinely related evidence.
      const relevance = coverage * 0.68 + Math.min(1, precision * 4) * 0.22 + confidence * 0.10
      return { ...candidate, relevance, matchedTerms }
    })
    // One accidental keyword is not enough to become evidence. Two terms are accepted even
    // for long prompts; otherwise require a strong aggregate score for very short questions.
    .filter(item => item.matchedTerms.length >= Math.min(2, promptTerms.length) || item.relevance >= 0.34)
    .sort((a, b) => b.relevance - a.relevance || b.confidence - a.confidence)
    .slice(0, limit)
}

export function formatRankedEvidence(items: RankedEvidence[]): string[] {
  return items.map(item => `[${item.id}] ${item.text} [relevance ${item.relevance.toFixed(2)}; confidence ${item.confidence.toFixed(2)}; source ${item.source}]`)
}
