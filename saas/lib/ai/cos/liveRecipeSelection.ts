import type { CosConnectorRecipe } from './connectorDelegation.ts'
import type { CosRecipeConfidenceRecord } from './recipeConfidence.ts'
import { selectOptimizedRecipe, type RecipeOptimizationWeights } from './recipeOptimization.ts'

export interface LiveRecipeSelection {
  recipe: CosConnectorRecipe
  source: 'learned' | 'deterministic'
  optimizationScore: number
}

export function selectLiveRecipe(
  learned: CosConnectorRecipe | undefined,
  deterministic: CosConnectorRecipe,
  confidence: CosRecipeConfidenceRecord | undefined,
  minimumQuality: number,
  coolingDown: boolean,
  weights: RecipeOptimizationWeights = {},
): LiveRecipeSelection {
  if (!learned) return Object.freeze({ recipe: deterministic, source: 'deterministic', optimizationScore: 0 })

  const candidates = [
    {
      id: 'learned',
      quality: confidence?.lastQuality ?? minimumQuality,
      successes: confidence?.successes ?? 0,
      failures: confidence?.failures ?? 0,
      promoted: confidence?.promoted ?? false,
      coolingDown,
      capabilityCalls: learned.steps.length,
    },
    {
      id: 'deterministic',
      quality: minimumQuality,
      successes: 1,
      failures: 0,
      promoted: false,
      coolingDown: false,
      capabilityCalls: deterministic.steps.length,
    },
  ] as const

  const selected = selectOptimizedRecipe(candidates, weights)
  if (selected?.id === 'learned') {
    return Object.freeze({ recipe: learned, source: 'learned', optimizationScore: selected.optimizationScore })
  }
  return Object.freeze({ recipe: deterministic, source: 'deterministic', optimizationScore: selected?.optimizationScore ?? 0 })
}
