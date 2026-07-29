import { observationCopy, type ObservationCopy } from '../../portable/observation-copy.ts'
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

function metadataStrings(incident: SupervisorIncident, key: string): string[] {
  const value = incident.metadata[key]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
}

function incidentType(incident: SupervisorIncident): VercelIncidentType | 'unsupported' {
  const value = metadataString(incident, 'incidentType')
  if (value === 'provider_connection_failure') return 'provider_auth_failed'
  if (value === 'deployment_failed' || value === 'repeated_deployment_failure' || value === 'stuck_deployment' || value === 'canceled_production_deployment' || value === 'unknown_provider_state' || value === 'provider_api_unavailable' || value === 'provider_auth_failed') return value
  return 'unsupported'
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || 'unknown'
}

function readStep(stepId: string, description: string, parameters: Record<string, string | number | boolean | null | string[]> = {}, expectedResult?: string): RepairStep {
  return { stepId, action: 'read', description, protectedAction: false, parameters, expectedResult }
}

function stopStep(copy: ObservationCopy, reason: string): RepairStep {
  return { stepId: 'stop-unsupported', action: 'stop', description: reason, protectedAction: false, parameters: { reason }, expectedResult: copy.steps.stopExpected }
}

function verifyStep(copy: ObservationCopy, stepId: string, description: string): RepairStep {
  return { stepId, action: 'verify', description, protectedAction: false, parameters: { mode: 'read_only' }, expectedResult: copy.verification.verifyReadOnly }
}

function deploymentReadSteps(copy: ObservationCopy, deploymentId: string, suffix = ''): RepairStep[] {
  const idSuffix = suffix ? `-${suffix}` : ''
  return [
    readStep(`read-deployment${idSuffix}`, copy.steps.readDeployment, { provider: 'vercel', deploymentId }, copy.steps.readDeploymentExpected),
    readStep(`read-deployment-events${idSuffix}`, copy.steps.readEvents, { provider: 'vercel', deploymentId, includeLogs: true }, copy.steps.readEventsExpected),
  ]
}

function baseReadSteps(copy: ObservationCopy, incident: SupervisorIncident, type: VercelIncidentType): RepairStep[] {
  if (type === 'repeated_deployment_failure') {
    const deploymentIds = metadataStrings(incident, 'deploymentIds')
    if (!deploymentIds.length) return [stopStep(copy, copy.stops.missingRepeatedIds)]
    return deploymentIds.flatMap((deploymentId, index) => deploymentReadSteps(copy, deploymentId, String(index + 1)))
  }

  const deploymentId = metadataString(incident, 'deploymentId') ?? incident.affectedResource ?? null
  if (!deploymentId) return [stopStep(copy, copy.stops.missingDeploymentId)]
  return deploymentReadSteps(copy, deploymentId)
}

function envReadSteps(copy: ObservationCopy, incident: SupervisorIncident): RepairStep[] {
  return [
    readStep('read-project-env-names', copy.steps.readEnvNames, { provider: 'vercel', projectId: metadataString(incident, 'projectId') ?? null, targetEnvironment: incident.environment, namesOnly: true }, copy.steps.readEnvNamesExpected),
  ]
}

function aliasReadSteps(copy: ObservationCopy, incident: SupervisorIncident): RepairStep[] {
  return [
    readStep('read-production-aliases', copy.steps.readAliases, { provider: 'vercel', projectId: metadataString(incident, 'projectId') ?? null, namesOnly: true }, copy.steps.readAliasesExpected),
  ]
}

function diagnosisFor(copy: ObservationCopy, type: VercelIncidentType | 'unsupported'): string {
  if (type === 'deployment_failed') return copy.diagnoses.deploymentFailed
  if (type === 'repeated_deployment_failure') return copy.diagnoses.repeatedFailure
  if (type === 'stuck_deployment') return copy.diagnoses.stuckDeployment
  if (type === 'canceled_production_deployment') return copy.diagnoses.canceledProduction
  if (type === 'unknown_provider_state') return copy.diagnoses.unknownState
  if (type === 'provider_api_unavailable') return copy.diagnoses.apiUnavailable
  if (type === 'provider_auth_failed') return copy.diagnoses.authFailed
  return copy.diagnoses.unsupported
}

export class DeterministicVercelThinker implements Thinker {
  // The locale the plan is WRITTEN in. Every sentence in a plan is read by a person deciding
  // whether the diagnosis was sound; step ids and incident types are unaffected, so anything
  // machine-readable stays stable across locales.
  constructor(private readonly locale?: string) {}

  proposeRepairPlan(incident: SupervisorIncident): RepairPlan {
    const copy = observationCopy(this.locale)
    const type = incidentType(incident)
    const generatedAt = new Date().toISOString()
    const planId = `vercel-thinker-${safeId(incident.incidentId)}`
    const unsupported = incident.provider !== 'vercel' || type === 'unsupported'
    const steps: RepairStep[] = unsupported ? [stopStep(copy, copy.stops.unsupportedProvider)] : this.stepsFor(copy, incident, type)
    return {
      planId,
      incidentId: incident.incidentId,
      diagnosis: diagnosisFor(copy, type),
      confidenceScore: unsupported ? 10 : type === 'provider_api_unavailable' || type === 'unknown_provider_state' ? 35 : 65,
      requiresBrowser: false,
      riskLevel: type === 'provider_auth_failed' ? 'medium' : unsupported ? 'high' : 'low',
      targetProvider: 'vercel',
      targetEnvironment: incident.environment,
      steps,
      verificationSteps: [verifyStep(copy, 'verify-read-only-diagnosis', copy.steps.verifyDiagnosis)],
      generatedAt,
      schemaVersion,
    }
  }

  private stepsFor(copy: ObservationCopy, incident: SupervisorIncident, type: VercelIncidentType): RepairStep[] {
    if (type === 'provider_api_unavailable') return [readStep('retry-provider-read', copy.stops.retryAfterBackoff, { provider: 'vercel' })]
    if (type === 'provider_auth_failed') return [readStep('read-connection-metadata', copy.steps.readConnection, { provider: 'vercel', connectionId: metadataString(incident, 'providerConnectionId') ?? null, namesOnly: true })]
    const steps = baseReadSteps(copy, incident, type)
    if (steps.some(step => step.action === 'stop')) return steps
    if (type === 'deployment_failed' || type === 'repeated_deployment_failure') steps.push(...envReadSteps(copy, incident))
    if (type === 'canceled_production_deployment') steps.push(...aliasReadSteps(copy, incident))
    if (type === 'unknown_provider_state') steps.push(stopStep(copy, copy.stops.unknownState))
    return steps
  }
}
