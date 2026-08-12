import type { SupervisorIncident } from '../../supervisor/incident-schema.ts'
import type { CosConnectorRecipe } from './connectorDelegation.ts'

const recipe = (id: string, required: string[], optional: string[]): CosConnectorRecipe => Object.freeze({
  id,
  portableId: 'self-healing-supervisor',
  requiredCapabilities: Object.freeze(required),
  optionalCapabilities: Object.freeze(optional),
  steps: Object.freeze([...required.map(capabilityId => ({ capabilityId })), ...optional.map(capabilityId => ({ capabilityId, optional: true }))]),
})

export const DEPLOYMENT_INCIDENT_RECIPE = recipe('self-healing.deployment.v1', ['deployment.read', 'logs.search'], ['recent_changes.read', 'health.read', 'metrics.query'])
export const PERFORMANCE_INCIDENT_RECIPE = recipe('self-healing.performance.v1', ['metrics.query', 'logs.search'], ['deployment.read', 'recent_changes.read', 'health.read'])
export const INCIDENT_CORRELATION_RECIPE = recipe('self-healing.incident-correlation.v1', ['incident.read', 'logs.search'], ['metrics.query', 'deployment.read', 'recent_changes.read'])
export const HEALTH_INCIDENT_RECIPE = recipe('self-healing.health.v1', ['health.read', 'logs.search'], ['metrics.query', 'deployment.read', 'incident.read'])

/** Selects a bounded read-only evidence routine from the incident itself, without an LLM call. */
export function selectConnectorRecipe(incident: SupervisorIncident): CosConnectorRecipe {
  const text = `${incident.provider} ${incident.errorMessage} ${incident.evidence.map(item => item.summary).join(' ')}`.toLowerCase()
  if (/latency|slow|timeout|cpu|memory|throughput|p9[059]|performance/.test(text)) return PERFORMANCE_INCIDENT_RECIPE
  if (/deploy|release|build|rollback|revision|commit/.test(text)) return DEPLOYMENT_INCIDENT_RECIPE
  if (/incident|alert|outage|page|ticket/.test(text)) return INCIDENT_CORRELATION_RECIPE
  if (/health|unhealthy|degraded|availability|probe|heartbeat/.test(text)) return HEALTH_INCIDENT_RECIPE
  return DEPLOYMENT_INCIDENT_RECIPE
}
