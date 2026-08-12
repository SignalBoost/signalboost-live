import type { CosConnectorRecipe } from './connectorDelegation.ts'

const FALLBACK_BY_RECIPE: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'self-healing.performance.v1': Object.freeze(['deployment.read', 'recent_changes.read', 'health.read']),
  'self-healing.deployment.v1': Object.freeze(['recent_changes.read', 'health.read', 'metrics.query']),
  'self-healing.incident-correlation.v1': Object.freeze(['metrics.query', 'deployment.read', 'recent_changes.read']),
  'self-healing.health.v1': Object.freeze(['metrics.query', 'deployment.read', 'incident.read']),
})

/** Builds one bounded, read-only second-stage recipe. No LLM call is needed. */
export function selectEvidenceFallback(recipe: CosConnectorRecipe, failedCapabilities: readonly string[]): CosConnectorRecipe | null {
  const candidates = (FALLBACK_BY_RECIPE[recipe.id] ?? recipe.optionalCapabilities)
    .filter(capabilityId => !failedCapabilities.includes(capabilityId))
    .slice(0, 2)
  if (candidates.length === 0) return null
  return Object.freeze({
    id: `${recipe.id}.fallback`,
    portableId: recipe.portableId,
    requiredCapabilities: Object.freeze([]),
    optionalCapabilities: Object.freeze(candidates),
    steps: Object.freeze(candidates.map(capabilityId => ({ capabilityId, optional: true }))),
  })
}
