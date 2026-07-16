import type { Thinker } from '../../execution-contracts.ts'
import type { SupervisorIncident } from '../../incident-schema.ts'
import type { RepairPlan, RepairStep } from '../../repair-plan-schema.ts'

const schemaVersion = 'vercel-thinker-plan-v1'

type VercelIncidentType =
  | 'deployment_failed'
  | 'repeated_deployment_failure'
  | 'stuck_deployment'
  | 'canceled_production_deployment'
  | 'unknown_provider_state'
  | 'provider_api_unavailable'
  | 'provider_auth_failed'

function metadataString(incident: SupervisorIncident, key: string): string | undefined {
  const value = incident.metadata[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function incidentType(incident: SupervisorIncident): VercelIncidentType | 'unsupported' {
  const value = metadataString(incident, 'incidentType')
  if (value === 'deployment_failed' || value === 'repeated_deployment_failure' || value === 'stuck_deployment' || value === 'canceled_production_deployment' || value === 'unknown_provider_state' || value === 'provider_api_unavailable' || value === 'provider_auth_failed') return value
  return 'unsupported'
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || 'unknown'
}

function readStep(stepId: string, description: string, parameters: Record<string, string | number | boolean | null | string[]> = {}, expectedResult?: string): RepairStep {
  return { stepId, action: 'read', description, protectedAction: false, parameters, expectedResult }
}

function stopStep(reason: string): RepairStep {
  return { stepId: 'stop-unsupported', action: 'stop', description: reason, protectedAction: false, parameters: { reason }, expectedResult: 'No execution is attempted for unsupported or ambiguous cases.' }
}

function verifyStep(stepId: string, description: string): RepairStep {
  return { stepId, action: 'verify', description, protectedAction: false, parameters: { mode: 'read_only' }, expectedResult: 'Verification uses read-only Vercel/API observations only.' }
}

function baseReadSteps(incident: SupervisorIncident): RepairStep[] {
  const deploymentId = metadataString(incident, 'deploymentId') ?? incident.affectedResource ?? null
  return [
    readStep('read-deployment', 'Read the selected failed Vercel deployment details before diagnosing.', { provider: 'vercel', deploymentId }, 'Deployment state, target, commit metadata, and sanitized error summary are available.'),
    readStep('read-deployment-events', 'Read deployment events and build/runtime logs for the selected deployment.', { provider: 'vercel', deploymentId, includeLogs: true }, 'Sanitized build events/log summaries are available without secret values.'),
  ]
}

function envReadSteps(incident: SupervisorIncident): RepairStep[] {
  return [
    readStep('read-project-env-names', 'Inspect configured environment variable names for the project and target only; do not read secret values.', { provider: 'vercel', projectId: metadataString(incident, 'projectId') ?? null, targetEnvironment: incident.environment, namesOnly: true }, 'Only variable names/targets are compared; plaintext values are never requested.'),
  ]
}

function aliasReadSteps(incident: SupervisorIncident): RepairStep[] {
  return [
    readStep('read-production-aliases', 'Inspect production aliases to determine whether the canceled deployment affected the live alias.', { provider: 'vercel', projectId: metadataString(incident, 'projectId') ?? null, namesOnly: true }, 'Alias pointers are available for review without modifying production.'),
  ]
}

function diagnosisFor(incident: SupervisorIncident, type: VercelIncidentType | 'unsupported'): string {
  if (type === 'deployment_failed') return 'A Vercel deployment failed. Diagnose from the latest failed deployment, its events, and sanitized logs before proposing any repair.'
  if (type === 'repeated_deployment_failure') return 'Multiple recent Vercel deployments failed consecutively. Compare the latest failed deployments and logs to identify a shared root cause.'
  if (type === 'stuck_deployment') return 'A Vercel deployment appears stuck beyond the configured threshold. Confirm current provider state and events before any intervention.'
  if (type === 'canceled_production_deployment') return 'A production deployment was canceled. Inspect production aliases to determine whether live traffic is affected before any recovery action.'
  if (type === 'unknown_provider_state') return 'Vercel returned an unknown deployment state. Fail closed and gather read-only provider details for human review.'
  if (type === 'provider_api_unavailable') return 'Vercel read APIs are unavailable or rate-limited. Do not infer an application repair until provider reads recover.'
  if (type === 'provider_auth_failed') return 'The Vercel observer cannot authenticate. Treat this as provider connection configuration work requiring protected approval.'
  return 'Unsupported Vercel incident shape. Fail closed and request human review.'
}

export class DeterministicVercelThinker implements Thinker {
  proposeRepairPlan(incident: SupervisorIncident): RepairPlan {
    const type = incidentType(incident)
    const generatedAt = new Date().toISOString()
    const planId = `vercel-thinker-${safeId(incident.incidentId)}`
    const unsupported = incident.provider !== 'vercel' || type === 'unsupported'
    const steps: RepairStep[] = unsupported ? [stopStep('Unsupported provider or Vercel incident type.')] : this.stepsFor(incident, type)
    return {
      planId,
      incidentId: incident.incidentId,
      diagnosis: diagnosisFor(incident, type),
      confidenceScore: unsupported ? 10 : type === 'provider_api_unavailable' || type === 'unknown_provider_state' ? 35 : 65,
      requiresBrowser: false,
      riskLevel: type === 'provider_auth_failed' ? 'medium' : unsupported ? 'high' : 'low',
      targetProvider: 'vercel',
      targetEnvironment: incident.environment,
      steps,
      verificationSteps: [verifyStep('verify-read-only-diagnosis', 'Verify that the diagnosis was based on the selected deployment, events/logs, and any required alias/env-name reads.')],
      generatedAt,
      schemaVersion,
    }
  }

  private stepsFor(incident: SupervisorIncident, type: VercelIncidentType): RepairStep[] {
    if (type === 'provider_api_unavailable') return [readStep('retry-provider-read', 'Retry read-only Vercel status/deployment reads after the bounded observer backoff window.', { provider: 'vercel' })]
    if (type === 'provider_auth_failed') return [readStep('read-connection-metadata', 'Inspect Vercel connection metadata and required secret references without exposing or rotating secret values.', { provider: 'vercel', connectionId: metadataString(incident, 'providerConnectionId') ?? null, namesOnly: true })]
    const steps = baseReadSteps(incident)
    if (type === 'deployment_failed' || type === 'repeated_deployment_failure') steps.push(...envReadSteps(incident))
    if (type === 'canceled_production_deployment') steps.push(...aliasReadSteps(incident))
    if (type === 'unknown_provider_state') steps.push(stopStep('Unknown Vercel state requires human/provider review after read-only evidence collection.'))
    return steps
  }
}
