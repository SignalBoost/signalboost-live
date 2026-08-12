import type { SupervisorIncident } from '../../supervisor/incident-schema.ts'
import type { CosConnectorRecipe } from './connectorDelegation.ts'

export interface CosRecipeReuseStore {
  get(key: string): CosConnectorRecipe | undefined
  set(key: string, recipe: CosConnectorRecipe): void
}

export function createInMemoryRecipeReuseStore(): CosRecipeReuseStore {
  const recipes = new Map<string, CosConnectorRecipe>()
  return Object.freeze({ get: key => recipes.get(key), set: (key, recipe) => { recipes.set(key, recipe) } })
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
