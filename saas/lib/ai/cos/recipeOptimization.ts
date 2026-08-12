export interface RecipeOptimizationCandidate {
  id: string
  quality: number
  successes: number
  failures: number
  averageLatencyMs?: number
  capabilityCalls?: number
  promoted?: boolean
  coolingDown?: boolean
}

export interface RecipeOptimizationWeights {
  quality?: number
  reliability?: number
  latency?: number
  efficiency?: number
  promotion?: number
}

export interface RankedRecipeCandidate extends RecipeOptimizationCandidate {
  optimizationScore: number
}

const DEFAULT_WEIGHTS = Object.freeze({
  quality: 0.4,
  reliability: 0.3,
  latency: 0.1,
  efficiency: 0.15,
  promotion: 0.05,
})

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

export function scoreRecipeCandidate(
  candidate: RecipeOptimizationCandidate,
  weights: RecipeOptimizationWeights = {},
): number {
  if (candidate.coolingDown) return -1
  const w = { ...DEFAULT_WEIGHTS, ...weights }
  const attempts = candidate.successes + candidate.failures
  const reliability = attempts > 0 ? candidate.successes / attempts : 0
  const latency = candidate.averageLatencyMs == null ? 0.5 : 1 / (1 + Math.max(0, candidate.averageLatencyMs) / 1000)
  const efficiency = candidate.capabilityCalls == null ? 0.5 : 1 / Math.max(1, candidate.capabilityCalls)
  const promotion = candidate.promoted ? 1 : 0
  return (
    clamp01(candidate.quality) * w.quality +
    clamp01(reliability) * w.reliability +
    clamp01(latency) * w.latency +
    clamp01(efficiency) * w.efficiency +
    promotion * w.promotion
  )
}

export function rankRecipeCandidates(
  candidates: readonly RecipeOptimizationCandidate[],
  weights: RecipeOptimizationWeights = {},
): RankedRecipeCandidate[] {
  return candidates
    .map(candidate => Object.freeze({ ...candidate, optimizationScore: scoreRecipeCandidate(candidate, weights) }))
    .sort((a, b) => b.optimizationScore - a.optimizationScore || a.id.localeCompare(b.id))
}

export function selectOptimizedRecipe(
  candidates: readonly RecipeOptimizationCandidate[],
  weights: RecipeOptimizationWeights = {},
): RankedRecipeCandidate | undefined {
  return rankRecipeCandidates(candidates, weights).find(candidate => candidate.optimizationScore >= 0)
}
