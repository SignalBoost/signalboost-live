import { evaluateCorpusEvidence, type CorpusEvidence } from './corpus-policy'

export type CorpusRefreshCandidate = Readonly<{
  id: string
  evidence: readonly CorpusEvidence[]
  lastUsedAt?: string | null
  priority?: number
}>

export type CorpusRefreshPlanItem = Readonly<{
  id: string
  score: number
  reasons: readonly string[]
}>

export function buildCorpusRefreshPlan(
  candidates: readonly CorpusRefreshCandidate[],
  options: { confidenceThreshold?: number; maxAgeDays?: number; limit?: number; now?: number } = {},
): CorpusRefreshPlanItem[] {
  const now = options.now ?? Date.now()
  const limit = Math.max(1, Math.min(1000, Math.trunc(options.limit ?? 100)))
  return candidates
    .map(candidate => {
      const decision = evaluateCorpusEvidence(candidate.evidence, options)
      if (!decision.enrichExternally) return null
      const lastUsed = candidate.lastUsedAt ? Date.parse(candidate.lastUsedAt) : 0
      const recency = Number.isFinite(lastUsed) && lastUsed > 0
        ? Math.max(0, 1 - (now - lastUsed) / (30 * 86_400_000))
        : 0
      const priority = Math.max(0, Math.min(1, Number(candidate.priority ?? 0.5)))
      const score = (1 - decision.confidence) * 0.55 + recency * 0.25 + priority * 0.2
      return { id: candidate.id, score, reasons: decision.reasons }
    })
    .filter((item): item is CorpusRefreshPlanItem => item !== null)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, limit)
}
