export type LearningQualityObservation = {
  strategy: string
  succeeded: boolean
  latencyMs: number
  externalCostUsd: number
  createdAt?: string | Date
}

export type LearningQualityReport = {
  observations: number
  baselineScore: number
  recentScore: number
  improvement: number
  improving: boolean
}

function score(rows: LearningQualityObservation[]) {
  if (!rows.length) return 0
  return rows.reduce((sum, row) => {
    const success = row.succeeded ? 1 : 0
    const efficiency = 1 / (1 + Math.max(0, row.externalCostUsd) * 100 + Math.max(0, row.latencyMs) / 10000)
    return sum + success * efficiency
  }, 0) / rows.length
}

/** Compare older observations with recent observations so learning has measurable value. */
export function measureLearningQuality(rows: LearningQualityObservation[]): LearningQualityReport {
  if (!rows.length) return { observations: 0, baselineScore: 0, recentScore: 0, improvement: 0, improving: false }
  const ordered = [...rows].sort((a, b) => {
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return at - bt
  })
  const split = Math.max(1, Math.floor(ordered.length / 2))
  const baselineScore = score(ordered.slice(0, split))
  const recentScore = score(ordered.slice(split).length ? ordered.slice(split) : ordered.slice(0, split))
  const improvement = recentScore - baselineScore
  return {
    observations: ordered.length,
    baselineScore,
    recentScore,
    improvement,
    improving: ordered.length >= 4 && improvement > 0,
  }
}
