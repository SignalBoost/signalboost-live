import { rankEvidence, formatRankedEvidence } from '@/lib/ai/cos/evidenceRanking'

export function rerankRetrievedEvidence(
  prompt: string,
  facts: Array<{subject:unknown;predicate:unknown;object:unknown;confidence:unknown;source:unknown}>,
  learned: Array<{subject:unknown;summary:unknown;facts:unknown;confidence:unknown;source_kind:unknown;source_uri:unknown}>,
  safeText: (value:unknown,max?:number)=>string,
): { facts:string[]; learned:string[] } {
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
  return {
    facts: formatRankedEvidence(rankEvidence(prompt, factCandidates, 8)),
    learned: formatRankedEvidence(rankEvidence(prompt, learnedCandidates, 6)),
  }
}
