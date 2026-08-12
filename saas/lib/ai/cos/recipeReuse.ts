import type { SupervisorIncident } from '../../supervisor/incident-schema.ts'
import type { CosConnectorRecipe, CosDelegationResult } from './connectorDelegation.ts'

export interface CosRecipeReuseStore {
  get(key: string): CosConnectorRecipe | undefined | Promise<CosConnectorRecipe | undefined>
  set(key: string, recipe: CosConnectorRecipe): void | Promise<void>
  delete?(key: string): void | Promise<void>
}

export interface InMemoryRecipeReuseOptions {
  maxAgeMs?: number
  now?: () => number
}

export function createInMemoryRecipeReuseStore(options: InMemoryRecipeReuseOptions = {}): CosRecipeReuseStore {
  const maxAgeMs = options.maxAgeMs ?? 24 * 60 * 60 * 1000
  const now = options.now ?? Date.now
  const recipes = new Map<string, { recipe: CosConnectorRecipe; updatedAt: number }>()
  return Object.freeze({
    get: key => {
      const value = recipes.get(key)
      if (!value) return undefined
      if (maxAgeMs > 0 && now() - value.updatedAt > maxAgeMs) { recipes.delete(key); return undefined }
      return value.recipe
    },
    set: (key, recipe) => { recipes.set(key, { recipe, updatedAt: now() }) },
    delete: key => { recipes.delete(key) },
  })
}

/** Deterministic quality score for a connector evidence run, 0..1. */
export function scoreRecipeEvidence(result: CosDelegationResult): number {
  if (!result.ok || result.missingRequired.length > 0 || result.evidence.length === 0) return 0
  const successful = result.evidence.filter(item => item.result.ok).length
  return Math.max(0, Math.min(1, successful / result.evidence.length))
}

/** Stable, tenant-scoped coarse signature. It intentionally avoids incident ids and raw payloads. */
export function incidentRecipeReuseKey(tenantId: string, incident: SupervisorIncident): string {
  const text = `${incident.provider} ${incident.errorMessage}`.toLowerCase()
  const kind = /latency|slow|timeout|cpu|memory|throughput|p9[059]|performance/.test(text) ? 'performance'
    : /deploy|release|build|rollback|revision|commit/.test(text) ? 'deployment'
    : /incident|alert|outage|page|ticket/.test(text) ? 'incident'
    : /health|unhealthy|degraded|availability|probe|heartbeat/.test(text) ? 'health' : 'other'
  return `${tenantId}:${incident.environment}:${incident.provider}:${kind}`
}
