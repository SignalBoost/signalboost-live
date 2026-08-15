// Native monitoring -> connector evidence -> COS-first diagnosis -> governed Agent Gateway remediation.
import type { SupervisorIncident } from '@/lib/supervisor/incident-schema'
import type { NormalizedIncidentPayload, SupervisorSeverity } from '@/lib/autonomous-supervisor/types'
import { diagnoseIncident } from '@/lib/autonomous-supervisor/diagnostic'
import { executeCosConnectorRecipe } from '@/lib/ai/cos/connectorDelegation'
import { compactDelegatedEvidence } from '@/lib/ai/cos/evidenceCompaction'
import { NATIVE_PLATFORM_INCIDENT_RECIPE } from '@/lib/ai/cos/incidentRecipeRouter'
import { createSignalBoostSupervisorConnectorRuntime, SIGNALBOOST_SUPERVISOR_CONNECTOR_TENANT } from './signalboost-supervisor-connectors'
import { createNativeRepairActionResolver } from './native-repair-action-resolver'
import { recordCouncilOutcomesFromRepairDispatch, type CouncilOutcomeBridgeSummary } from './council-outcome-bridge'
import { SELF_HEALING_GATEWAY_POLICY } from './self-healing-gateway-policy'
import { createSignalBoostGatewayHost } from '@/agent-gateway-host/signalboost-host'
import { dispatchRepairPlan, type RepairStep } from '@/agent-gateway-host/supervisor-repair'
import { resolveSupervisorRepairParams, summarizeRepairDispatch } from '@/agent-gateway-host/supervisor-actions'

function severity(value: SupervisorIncident['severity']): SupervisorSeverity {
  if (value === 'critical') return 'CRITICAL'
  if (value === 'warning') return 'MEDIUM'
  return 'LOW'
}

export function nativeIncidentToNormalized(incident: SupervisorIncident, connectorEvidence: unknown): NormalizedIncidentPayload {
  const rawEvidence = { incidentEvidence: incident.evidence, metadata: incident.metadata, connectorEvidence }
  return {
    incident_id: incident.incidentId,
    timestamp: incident.detectedAt,
    provider: incident.provider,
    project: process.env.VERCEL_PROJECT_ID || 'signalboost-live',
    severity: severity(incident.severity),
    trigger: 'NATIVE_HEALTH',
    error_summary: `${incident.errorCode || 'native_health'}: ${incident.errorMessage}`.slice(0, 1200),
    raw_logs: JSON.stringify(rawEvidence).slice(0, 16_000),
    context: {
      last_successful_deploy: null,
      recent_env_changes: [],
      affected_resource: incident.affectedResource ?? null,
      native_probe: typeof incident.metadata?.nativeProbe === 'string' ? incident.metadata.nativeProbe : null,
      connector_evidence: connectorEvidence,
    },
  }
}

export interface NativeRemediationResult {
  incidentId: string
  diagnosisConfidence: number
  diagnosis: string
  repairSteps: number
  outcome: 'no_action' | 'executed' | 'staged' | 'unavailable'
  message: string
  objectiveOutcomes?: CouncilOutcomeBridgeSummary
}

export async function remediateNativeIncidents(incidents: readonly SupervisorIncident[], options: { maxIncidents?: number } = {}): Promise<NativeRemediationResult[]> {
  const max = Math.max(1, Math.min(options.maxIncidents ?? 4, 8))
  const runtime = createSignalBoostSupervisorConnectorRuntime()
  const results: NativeRemediationResult[] = []

  for (const incident of incidents.slice(0, max)) {
    const delegated = await executeCosConnectorRecipe(runtime, {
      tenantId: SIGNALBOOST_SUPERVISOR_CONNECTOR_TENANT,
      environmentId: incident.environment || 'production',
      portableId: 'self-healing-supervisor',
      traceId: incident.incidentId,
      recipe: NATIVE_PLATFORM_INCIDENT_RECIPE,
    })
    const evidence = compactDelegatedEvidence(delegated)
    const normalized = nativeIncidentToNormalized(incident, evidence)
    const diagnostic = await diagnoseIncident(normalized)
    const repairPlan = Array.isArray(diagnostic.repair_plan) ? diagnostic.repair_plan as RepairStep[] : []

    if (!repairPlan.length) {
      results.push({ incidentId: incident.incidentId, diagnosisConfidence: diagnostic.confidence_score, diagnosis: diagnostic.diagnosis, repairSteps: 0, outcome: 'no_action', message: diagnostic.escalation_reason || 'COS diagnosed the incident and proposed no safe repair.' })
      continue
    }

    try {
      const dispatched = await dispatchRepairPlan({
        incident: { incident_id: normalized.incident_id, project: normalized.project, provider: normalized.provider },
        repairPlan,
        policy: SELF_HEALING_GATEWAY_POLICY,
        host: createSignalBoostGatewayHost(),
        resolveAction: createNativeRepairActionResolver(incident),
        resolveParams: resolveSupervisorRepairParams,
        agentId: 'cos-native-self-healing',
      })
      const objectiveOutcomes = await recordCouncilOutcomesFromRepairDispatch({
        incidentId: incident.incidentId,
        provider: incident.provider,
        environment: incident.environment || 'production',
        dispatch: dispatched,
      })
      const summary = summarizeRepairDispatch(dispatched, repairPlan.length)
      results.push({
        incidentId: incident.incidentId,
        diagnosisConfidence: diagnostic.confidence_score,
        diagnosis: diagnostic.diagnosis,
        repairSteps: repairPlan.length,
        outcome: dispatched.completed ? 'executed' : summary.mode === 'staged' ? 'staged' : 'unavailable',
        message: dispatched.completed ? 'The registered repair completed through Agent Gateway governance.' : summary.message,
        objectiveOutcomes,
      })
    } catch (error) {
      results.push({ incidentId: incident.incidentId, diagnosisConfidence: diagnostic.confidence_score, diagnosis: diagnostic.diagnosis, repairSteps: repairPlan.length, outcome: 'unavailable', message: error instanceof Error ? error.message : 'governed remediation failed' })
    }
  }
  return results
}
