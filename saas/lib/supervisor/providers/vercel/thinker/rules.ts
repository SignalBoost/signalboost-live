import type { SupervisorIncident } from '../../../incident-schema.ts'
import type { RepairStep } from '../../../repair-plan-schema.ts'

export type VercelThinkerIncidentType =
  | 'failed_deployment'
  | 'repeated_deployment_failure'
  | 'canceled_production_deployment'
  | 'stuck_deployment'
  | 'unknown_provider_state'

export type VercelBuildErrorClassifier = 'envMissing' | 'dependencyMissing' | 'runtimeUndefined' | 'unknown'

export interface VercelReadEndpoint {
  method: 'GET'
  endpoint: string
  reason: string
}

const endpoint = (endpoint: string, reason: string): VercelReadEndpoint => ({ method: 'GET', endpoint, reason })

const INCIDENT_TYPE_KEY = 'incidentType'
const DEPLOYMENT_ID_KEY = 'deploymentId'
const DEPLOYMENT_IDS_KEY = 'deploymentIds'

const ENV_MISSING_PATTERNS = [
  /(?:missing|required|undefined|not\s+set|not\s+configured)\s+(?:environment\s+)?(?:variable|env(?:ironment)?\s+var)\b/i,
  /\b(?:environment\s+)?(?:variable|env(?:ironment)?\s+var)\s+[A-Z][A-Z0-9_]{2,}\s+(?:is\s+)?(?:missing|required|undefined|not\s+set|not\s+configured)\b/i,
  /\bprocess\.env\.[A-Z][A-Z0-9_]{2,}\s+(?:is\s+)?(?:missing|required|undefined|not\s+set|not\s+configured)\b/i,
]

const ENV_MISSING_FALSE_POSITIVES = [
  /\bmodule\s+not\s+found\b/i,
  /\bcannot\s+find\s+module\b/i,
  /\bcan't\s+resolve\b/i,
  /\bproperties\s+of\s+undefined\b/i,
  /\bproperty\s+[^\n]+\s+of\s+undefined\b/i,
  /\bundefined\s+is\s+not\s+(?:an?\s+)?(?:object|function)\b/i,
]

function stringMetadata(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function stringArrayMetadata(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : []
}

export function extractLatestFailedDeploymentId(incident: Pick<SupervisorIncident, 'metadata'>): string | undefined {
  const sequence = stringArrayMetadata(incident.metadata[DEPLOYMENT_IDS_KEY])
  return sequence[0] || stringMetadata(incident.metadata[DEPLOYMENT_ID_KEY])
}

export function classifyVercelBuildError(message: string): VercelBuildErrorClassifier {
  if (ENV_MISSING_FALSE_POSITIVES.some(pattern => pattern.test(message))) {
    if (/\b(module\s+not\s+found|cannot\s+find\s+module|can't\s+resolve)\b/i.test(message)) return 'dependencyMissing'
    if (/\b(properties\s+of\s+undefined|property\s+[^\n]+\s+of\s+undefined|undefined\s+is\s+not)/i.test(message)) return 'runtimeUndefined'
    return 'unknown'
  }
  return ENV_MISSING_PATTERNS.some(pattern => pattern.test(message)) ? 'envMissing' : 'unknown'
}

export function isLikelyMissingEnvironmentVariableError(message: string): boolean {
  return classifyVercelBuildError(message) === 'envMissing'
}

export function getVercelReadEndpointsForIncident(incident: Pick<SupervisorIncident, 'metadata'>): VercelReadEndpoint[] {
  const incidentType = stringMetadata(incident.metadata[INCIDENT_TYPE_KEY]) as VercelThinkerIncidentType | undefined
  if (incidentType === 'repeated_deployment_failure') {
    const latestFailedId = extractLatestFailedDeploymentId(incident)
    return [
      endpoint('/v6/deployments', 'Read the latest deployment sequence before diagnosing repeated failures.'),
      ...(latestFailedId ? [endpoint(`/v2/deployments/${encodeURIComponent(latestFailedId)}/events`, 'Read logs for the latest failed deployment in the repeated-failure sequence.')] : []),
    ]
  }
  if (incidentType === 'canceled_production_deployment') {
    const deploymentId = stringMetadata(incident.metadata[DEPLOYMENT_ID_KEY])
    return [
      ...(deploymentId ? [endpoint(`/v13/deployments/${encodeURIComponent(deploymentId)}`, 'Read the canceled production deployment details.')] : []),
      endpoint('/v4/aliases', 'Read production aliases before diagnosing a canceled production deployment.'),
    ]
  }
  const deploymentId = stringMetadata(incident.metadata[DEPLOYMENT_ID_KEY])
  return deploymentId ? [endpoint(`/v13/deployments/${encodeURIComponent(deploymentId)}`, 'Read deployment details before proposing a repair.')] : []
}

export function buildVercelReadStepsForIncident(incident: SupervisorIncident): RepairStep[] {
  return getVercelReadEndpointsForIncident(incident).map((readEndpoint, index) => ({
    stepId: `vercel-read-${index + 1}`,
    action: 'read',
    description: readEndpoint.reason,
    protectedAction: false,
    parameters: { ...readEndpoint },
    expectedResult: 'Read-only Vercel diagnostic data is available for owner-reviewed repair planning.',
  }))
}

export const vercelThinkerRules = {
  classifyVercelBuildError,
  extractLatestFailedDeploymentId,
  getVercelReadEndpointsForIncident,
  buildVercelReadStepsForIncident,
  isLikelyMissingEnvironmentVariableError,
}
