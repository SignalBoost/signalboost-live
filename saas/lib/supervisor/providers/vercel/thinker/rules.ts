import { createHash } from 'crypto'
import type { SupervisorIncident, SerializableValue } from '../../../incident-schema.ts'
import { repairPlanSchema, type RepairPlan, type RepairStep } from '../../../repair-plan-schema.ts'
import type { VercelThinkerRule } from './types.ts'

function text(value: unknown): string { return String(value ?? '').toLowerCase() }
function metaString(incident: SupervisorIncident, key: string): string { return String(incident.metadata[key] ?? '') }
function incidentType(incident: SupervisorIncident): string { return metaString(incident, 'incidentType') }
function id(prefix: string, incident: SupervisorIncident): string { return `${prefix}-${createHash('sha256').update(incident.incidentId).digest('hex').slice(0, 12)}` }
function params(input: Record<string, SerializableValue>): Record<string, SerializableValue> { return input }
function step(stepId: string, action: RepairStep['action'], description: string, parameters: Record<string, SerializableValue> = {}, expectedResult?: string): RepairStep {
  return { stepId, action, description, protectedAction: false, parameters, expectedResult }
}
function approval(stepId: string, description: string, parameters: Record<string, SerializableValue> = {}): RepairStep { return { stepId, action: 'request_approval', description, protectedAction: true, parameters, expectedResult: 'Owner approval is recorded before any provider mutation.' } }
function verify(stepId: string, description: string, parameters: Record<string, SerializableValue> = {}): RepairStep { return step(stepId, 'verify', description, parameters, 'Diagnostic evidence confirms the incident is understood or resolved.') }
function plan(input: { incident: SupervisorIncident; now: Date; schemaVersion: string; diagnosis: string; confidenceScore: number; riskLevel: RepairPlan['riskLevel']; steps: RepairStep[]; verificationSteps: RepairStep[]; rollbackSteps?: RepairStep[] }): RepairPlan {
  const out: RepairPlan = { planId: id('vercel-plan', input.incident), incidentId: input.incident.incidentId, diagnosis: input.diagnosis, confidenceScore: input.confidenceScore, requiresBrowser: false, riskLevel: input.riskLevel, targetProvider: 'vercel', targetEnvironment: input.incident.environment, steps: input.steps, verificationSteps: input.verificationSteps, rollbackSteps: input.rollbackSteps, generatedAt: input.now.toISOString(), schemaVersion: input.schemaVersion }
  return repairPlanSchema.parse(out)
}

const baseReadParams = (incident: SupervisorIncident) => params({ projectId: metaString(incident, 'projectId'), deploymentId: metaString(incident, 'deploymentId'), providerConnectionId: metaString(incident, 'providerConnectionId') })

export const vercelThinkerRules: VercelThinkerRule[] = [
  {
    id: 'provider_connection_failure',
    matches: i => incidentType(i) === 'provider_connection_failure',
    buildPlan: ({ incident, now, schemaVersion }) => plan({ incident, now, schemaVersion, diagnosis: 'Vercel API authentication or authorization failed. Diagnose the stored provider connection without exposing or rotating secrets automatically.', confidenceScore: 92, riskLevel: 'medium', steps: [step('read-provider-connection', 'read', 'Read masked Vercel provider connection status.', baseReadParams(incident)), step('read-project-metadata', 'api_request', 'Call read-only Vercel project metadata endpoint with injected secret reference.', { ...baseReadParams(incident), method: 'GET', endpoint: '/v9/projects/{projectId}', secretRef: `provider-connection:${metaString(incident, 'providerConnectionId')}` }), approval('stage-credential-repair', 'Stage an Infrastructure PR proposal for owner review if credentials must be replaced.', { templateId: 'vercel.connection.repair', providerConnectionId: metaString(incident, 'providerConnectionId') })], verificationSteps: [verify('verify-connection-readable', 'Verify the Vercel project metadata endpoint is readable with the approved connection.', baseReadParams(incident))] })
  },
  {
    id: 'provider_api_unavailable',
    matches: i => incidentType(i) === 'provider_api_unavailable',
    buildPlan: ({ incident, now, schemaVersion }) => plan({ incident, now, schemaVersion, diagnosis: 'Vercel API was unavailable after bounded retries. Do not mutate state; collect status and retry-read evidence.', confidenceScore: 88, riskLevel: 'low', steps: [step('read-vercel-status', 'api_request', 'Read public Vercel status for active incidents.', { method: 'GET', endpoint: 'https://www.vercel-status.com/api/v2/status.json' }), step('retry-read-deployments', 'api_request', 'Retry the read-only recent deployments request after provider backoff.', { ...baseReadParams(incident), method: 'GET', endpoint: '/v6/deployments', retryAfterMs: Number(incident.metadata.retryAfterMs || 0) })], verificationSteps: [verify('verify-api-readable', 'Verify Vercel read APIs are reachable or provider outage is documented.', baseReadParams(incident))] })
  },
  {
    id: 'repeated_deployment_failure',
    matches: i => incidentType(i) === 'repeated_deployment_failure',
    buildPlan: ({ incident, now, schemaVersion }) => plan({ incident, now, schemaVersion, diagnosis: 'Multiple consecutive deployments failed. Compare failed deployment metadata and logs before staging any redeploy or environment repair.', confidenceScore: 86, riskLevel: incident.environment === 'production' ? 'high' : 'medium', steps: [step('read-failure-sequence', 'read', 'Read normalized failed deployment sequence.', { deploymentIds: incident.metadata.deploymentIds || [], projectId: metaString(incident, 'projectId') }), step('read-latest-build-log', 'api_request', 'Read latest failed deployment build log metadata only.', baseReadParams(incident)), approval('stage-repair-pr', 'Stage a gated Infrastructure PR with the deterministic diagnosis and proposed owner-approved provider action.', { templateId: 'vercel.deployment.failure.sequence', projectId: metaString(incident, 'projectId') })], verificationSteps: [verify('verify-newer-ready-deployment', 'Verify a newer deployment is READY before closing the incident.', { projectId: metaString(incident, 'projectId'), requiredState: 'READY' })], rollbackSteps: [approval('rollback-to-last-ready', 'Only after owner approval, roll back to the last known READY deployment if needed.', { projectId: metaString(incident, 'projectId') })] })
  },
  {
    id: 'stuck_deployment',
    matches: i => incidentType(i) === 'stuck_deployment',
    buildPlan: ({ incident, now, schemaVersion }) => plan({ incident, now, schemaVersion, diagnosis: 'A deployment exceeded the configured queued/building threshold. Confirm current state through read-only APIs before proposing cancellation or redeploy.', confidenceScore: 84, riskLevel: incident.environment === 'production' ? 'high' : 'medium', steps: [step('read-current-deployment', 'api_request', 'Read current deployment state from Vercel.', { ...baseReadParams(incident), method: 'GET', endpoint: '/v13/deployments/{deploymentId}' }), step('read-project-queue', 'api_request', 'Read recent deployments to determine whether a newer deployment superseded the stuck deployment.', { projectId: metaString(incident, 'projectId'), method: 'GET', endpoint: '/v6/deployments' }), approval('stage-stuck-deployment-action', 'Stage owner-gated cancel or redeploy action if the deployment remains stuck.', { deploymentId: metaString(incident, 'deploymentId'), thresholdMs: Number(incident.metadata.thresholdMs || 0) })], verificationSteps: [verify('verify-no-stuck-active-deployment', 'Verify no active deployment remains past the stuck threshold.', { projectId: metaString(incident, 'projectId') })] })
  },
  {
    id: 'canceled_production_deployment',
    matches: i => incidentType(i) === 'canceled_production_deployment',
    buildPlan: ({ incident, now, schemaVersion }) => plan({ incident, now, schemaVersion, diagnosis: 'A production deployment was canceled. Inspect current production readiness and require owner approval before any redeploy.', confidenceScore: 82, riskLevel: 'high', steps: [step('read-production-alias', 'api_request', 'Read current production deployment and alias status.', { projectId: metaString(incident, 'projectId'), environment: 'production', method: 'GET' }), approval('stage-production-redeploy', 'Stage production redeploy proposal for owner approval only if no newer READY deployment exists.', { projectId: metaString(incident, 'projectId') })], verificationSteps: [verify('verify-production-ready', 'Verify production has a READY deployment before closing.', { projectId: metaString(incident, 'projectId'), environment: 'production' })] })
  },
  {
    id: 'failed_deployment',
    matches: i => incidentType(i) === 'failed_deployment',
    buildPlan: ({ incident, now, schemaVersion }) => {
      const message = `${incident.errorMessage} ${metaString(incident, 'sanitizedErrorMessage')} ${metaString(incident, 'sanitizedErrorCode')}`
      const envMissing = /env|environment variable|missing|not found|undefined/.test(text(message))
      return plan({ incident, now, schemaVersion, diagnosis: envMissing ? 'Deployment failed with evidence consistent with missing configuration or environment variables. Read diagnostics and stage any env repair behind owner approval.' : 'Deployment failed. Gather deterministic deployment diagnostics before proposing any owner-gated repair.', confidenceScore: envMissing ? 87 : 78, riskLevel: incident.environment === 'production' ? 'high' : 'medium', steps: [step('read-deployment', 'api_request', 'Read failed deployment metadata from Vercel.', { ...baseReadParams(incident), method: 'GET', endpoint: '/v13/deployments/{deploymentId}' }), step('read-build-diagnostics', 'api_request', 'Read sanitized build diagnostics and framework error summaries.', { ...baseReadParams(incident), method: 'GET', endpoint: '/v2/deployments/{deploymentId}/events' }), approval(envMissing ? 'stage-env-var-pr' : 'stage-deployment-repair-pr', envMissing ? 'Stage an owner-gated environment-variable Infrastructure PR; do not save provider changes directly.' : 'Stage an owner-gated deployment repair proposal; do not redeploy directly.', { projectId: metaString(incident, 'projectId'), deploymentId: metaString(incident, 'deploymentId'), reason: envMissing ? 'missing_configuration' : 'deployment_failure' })], verificationSteps: [verify('verify-successor-ready', 'Verify a later deployment reaches READY before closing.', { projectId: metaString(incident, 'projectId'), afterDeploymentId: metaString(incident, 'deploymentId') })], rollbackSteps: [approval('rollback-proposal', 'Stage rollback proposal for owner approval if the failed deployment affected production traffic.', { projectId: metaString(incident, 'projectId') })] })
    }
  },
]

export function unsupportedVercelIncidentPlan(incident: SupervisorIncident, now: Date, schemaVersion: string): RepairPlan {
  return plan({ incident, now, schemaVersion, diagnosis: `Unsupported Vercel incident type ${incidentType(incident) || 'unknown'} requires manual owner review.`, confidenceScore: 40, riskLevel: 'medium', steps: [step('read-incident-evidence', 'read', 'Read sanitized incident evidence and preserve audit trail.', { incidentType: incidentType(incident) || 'unknown', provider: incident.provider }), approval('request-owner-triage', 'Request owner triage before any provider action is taken.', { incidentId: incident.incidentId })], verificationSteps: [verify('verify-owner-triage-recorded', 'Verify owner triage decision has been recorded.', { incidentId: incident.incidentId })] })
}
