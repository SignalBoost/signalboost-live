import { getVercelDeployments } from '@/lib/hub/deployments-service'
import { diagnoseIncident } from '@/lib/autonomous-supervisor/diagnostic'
import type { NormalizedIncidentPayload } from '@/lib/autonomous-supervisor/types'
import { createSignalBoostGatewayHost, GATEWAY_POLICY } from '@/agent-gateway-host/signalboost-host.ts'
import { dispatchRepairPlan } from '@/agent-gateway-host/supervisor-repair.ts'
import type { RepairStep } from '@/agent-gateway-host/supervisor-repair.ts'
import { resolveSupervisorRepairAction, resolveSupervisorRepairParams, summarizeRepairDispatch } from '@/agent-gateway-host/supervisor-actions.ts'
import type {
  CosAutonomyPlan,
  CosProposedAction,
  PortableActionResult,
  PortableManifest,
  PortableObservation,
  PortableRecoveryResult,
  PortableVerificationResult,
  UniversalPortableRuntime,
} from '@/lib/ai/cos/autonomy/types.ts'
import { COS_AUTONOMY_SCHEMA_VERSION } from '@/lib/ai/cos/autonomy/types.ts'

function deploymentConfig() {
  const token = process.env.VERCEL_TOKEN || ''
  const projectId = process.env.VERCEL_PROJECT_ID || ''
  const teamId = process.env.VERCEL_TEAM_ID || ''
  if (!token || !projectId) throw new Error('self_healing_portable_missing_vercel_configuration')
  return { token, projectId, teamId }
}

function fingerprint(value: unknown): string {
  const text = JSON.stringify(value)
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a-${(hash >>> 0).toString(16)}`
}

const manifest: PortableManifest = Object.freeze({
  schemaVersion: COS_AUTONOMY_SCHEMA_VERSION,
  portableId: 'self-healing-supervisor',
  portableVersion: '1.0.0',
  capabilities: Object.freeze([
    Object.freeze({
      capabilityId: 'supervisor.inspect_deployments',
      version: '1.0.0',
      description: 'Inspect recent Vercel deployment state without changing infrastructure.',
      readOnly: true,
      reversible: true,
      requiresApproval: false,
      riskClass: 'read_only' as const,
      evidenceTypes: Object.freeze(['vercel_deployment_state']),
      verificationTypes: Object.freeze(['observation_returned']),
    }),
    Object.freeze({
      capabilityId: 'supervisor.route_latest_failed_deployment',
      version: '1.0.0',
      description: 'Diagnose the latest failed Vercel deployment and route the resulting repair plan into the Supervisor governed gateway. The gateway retains final execution authority.',
      readOnly: false,
      reversible: true,
      requiresApproval: false,
      riskClass: 'low_risk_reversible' as const,
      evidenceTypes: Object.freeze(['vercel_deployment_state', 'supervisor_diagnostic']),
      verificationTypes: Object.freeze(['gateway_dispatch_result']),
    }),
  ]),
})

async function observeDeployments(): Promise<PortableObservation> {
  const { token, projectId, teamId } = deploymentConfig()
  const response = await getVercelDeployments(teamId, projectId, token, 10)
  if (!response.ok) throw new Error(response.error || 'self_healing_portable_observation_failed')
  const deployments = response.deployments ?? []
  const facts = {
    total: deployments.length,
    failed: deployments.filter(item => item.state === 'ERROR').map(item => ({ id: item.id, state: item.state, target: item.target, createdAt: item.createdAt, commitSha: item.meta?.githubCommitSha || null, commitMessage: item.meta?.githubCommitMessage || null })),
    ready: deployments.filter(item => item.state === 'READY').map(item => ({ id: item.id, target: item.target, createdAt: item.createdAt, commitSha: item.meta?.githubCommitSha || null })),
    latest: deployments[0] ? { id: deployments[0].id, state: deployments[0].state, target: deployments[0].target, createdAt: deployments[0].createdAt } : null,
  }
  return {
    observedAt: new Date().toISOString(),
    summary: facts.failed.length ? `${facts.failed.length} failed deployment(s) present in the recent Vercel window.` : 'No failed deployment is present in the recent Vercel window.',
    facts,
    evidenceIds: deployments.map(item => `vercel-deployment:${item.id}`),
    stateFingerprint: fingerprint(facts),
  }
}

function incidentFromObservation(observation: PortableObservation): NormalizedIncidentPayload | null {
  const failed = Array.isArray((observation.facts as any)?.failed) ? (observation.facts as any).failed[0] : null
  if (!failed?.id) return null
  const ready = Array.isArray((observation.facts as any)?.ready) ? (observation.facts as any).ready[0] : null
  return {
    incident_id: `cos-autonomy-vercel-${failed.id}`,
    timestamp: new Date().toISOString(),
    provider: 'Vercel',
    project: process.env.VERCEL_PROJECT_ID || 'signalboost-live',
    severity: failed.target === 'production' ? 'HIGH' : 'MEDIUM',
    trigger: 'DEPLOYMENT_STATUS',
    error_summary: `Vercel deployment ${failed.id} is in ERROR state${failed.commitMessage ? ` after commit: ${failed.commitMessage}` : ''}.`,
    raw_logs: 'The autonomous polling observation does not contain build logs. The diagnostic must not invent log evidence and should request only registered evidence-gathering actions when logs are required.',
    context: {
      last_successful_deploy: ready?.id || null,
      recent_env_changes: [],
      deployment_id: failed.id,
      deployment_url: null,
    },
  }
}

export function createSelfHealingSupervisorPortableRuntime(): UniversalPortableRuntime {
  let lastObservation: PortableObservation | undefined
  return {
    getManifest: () => manifest,
    async observe() {
      lastObservation = await observeDeployments()
      return lastObservation
    },
    async invoke({ action }: { objective: string; action: CosProposedAction }): Promise<PortableActionResult> {
      if (action.capabilityId === 'supervisor.inspect_deployments') {
        lastObservation = await observeDeployments()
        return { actionId: action.actionId, status: 'completed', summary: lastObservation.summary, evidenceIds: lastObservation.evidenceIds }
      }
      if (action.capabilityId !== 'supervisor.route_latest_failed_deployment') {
        return { actionId: action.actionId, status: 'blocked', summary: `Unknown Supervisor capability: ${action.capabilityId}` }
      }
      lastObservation = lastObservation ?? await observeDeployments()
      const incident = incidentFromObservation(lastObservation)
      if (!incident) return { actionId: action.actionId, status: 'completed', summary: 'No failed deployment exists to diagnose or route.' }
      const diagnostic = await diagnoseIncident(incident)
      const repairPlan = Array.isArray(diagnostic.repair_plan) ? diagnostic.repair_plan as RepairStep[] : []
      if (!repairPlan.length) return { actionId: action.actionId, status: 'completed', summary: 'Diagnosis produced no repair steps.', evidenceIds: [`diagnostic:${incident.incident_id}`] }
      const dispatched = await dispatchRepairPlan({
        incident: { incident_id: incident.incident_id, project: incident.project, provider: incident.provider },
        repairPlan,
        policy: GATEWAY_POLICY,
        host: createSignalBoostGatewayHost(),
        resolveAction: resolveSupervisorRepairAction,
        resolveParams: resolveSupervisorRepairParams,
      })
      const summary = summarizeRepairDispatch(dispatched, repairPlan.length)
      return {
        actionId: action.actionId,
        status: summary.mode === 'unavailable' ? 'failed' : 'completed',
        summary: summary.message,
        evidenceIds: [`diagnostic:${incident.incident_id}`, ...summary.prIds.map(id => `infrastructure-pr:${id}`)],
      }
    },
    async verify({ results }: { objective: string; observation: PortableObservation; plan: CosAutonomyPlan; results: readonly PortableActionResult[] }): Promise<PortableVerificationResult> {
      const failed = results.some(item => item.status === 'failed' || item.status === 'blocked')
      const next = await observeDeployments()
      return {
        status: failed ? 'failed' : 'verified',
        goalSatisfied: !failed,
        summary: failed ? 'At least one governed Supervisor action failed or was blocked.' : `Supervisor actions completed their governed handoff. ${next.summary}`,
        evidenceIds: next.evidenceIds,
      }
    },
    async recover(): Promise<PortableRecoveryResult> {
      return { status: 'not_available', summary: 'The COS adapter does not bypass the Supervisor rollback/gateway layer. Recovery remains owned by the portable governance runtime.' }
    },
  }
}

export { manifest as selfHealingSupervisorCosManifest }
