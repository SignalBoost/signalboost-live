// Real read-only connector runtime used by SignalBoost's own Self-Healing Supervisor.
import { createPortableCapabilityDescriptor, createPortableConnectorRuntime } from '@/provider-hub-core/index'
import type { PortableConnectorRuntimePort } from '@/lib/supervisor/portable/host-context'
import { getAdminSupabase } from '@/utils/supabase/server'
import { getVercelDeployments } from '@/lib/hub/deployments-service'

const TENANT = 'signalboost-platform'
const ENVIRONMENT = 'production'
const now = () => new Date().toISOString()

function descriptor(capabilityId: string, providerId = 'signalboost-platform', connectionId = 'signalboost-internal', available = true) {
  return createPortableCapabilityDescriptor({
    capabilityId, providerId, connectionId, tenantId: TENANT, environmentId: ENVIRONMENT,
    risk: 'read', availability: available ? 'available' : 'unavailable', requiresApproval: false,
    scopes: ['self-healing:read'], healthCheckedAt: now(),
  })
}

async function platformEvidence(capabilityId: string) {
  const db = getAdminSupabase()
  if (capabilityId === 'health.read' || capabilityId === 'metrics.query') {
    const limit = capabilityId === 'metrics.query' ? 64 : 16
    const { data, error } = await db.from('self_healing_native_probe_samples')
      .select('probe_id,target,observed_at,status,latency_ms,error_rate,metric_value,metric_unit,details')
      .order('observed_at', { ascending: false }).limit(limit)
    if (error) throw new Error(`native_probe_read_failed:${String(error.message || 'unknown').slice(0,160)}`)
    return { samples: data ?? [] }
  }
  if (capabilityId === 'incident.read') {
    const { data, error } = await db.from('supervisor_assessment_ledger')
      .select('recorded_at,environment,operational_state,impact_affected,confidence,page_on_call,contradictions,input_digest')
      .eq('environment', ENVIRONMENT).order('recorded_at', { ascending: false }).limit(12)
    if (error) throw new Error(`assessment_ledger_read_failed:${String(error.message || 'unknown').slice(0,160)}`)
    return { assessments: data ?? [] }
  }
  throw new Error(`unsupported_internal_capability:${capabilityId}`)
}

async function vercelEvidence(capabilityId: string) {
  const token = process.env.VERCEL_TOKEN || ''
  const projectId = process.env.VERCEL_PROJECT_ID || ''
  const teamId = process.env.VERCEL_TEAM_ID || ''
  if (!token || !projectId) throw new Error('vercel_read_configuration_missing')
  const response = await getVercelDeployments(teamId, projectId, token, 12)
  if (!response.ok) throw new Error(response.error || 'vercel_deployment_read_failed')
  const deployments = response.deployments ?? []
  if (capabilityId === 'deployment.read') return { deployments }
  return {
    recentChanges: deployments.map(item => ({
      id: item.id, state: item.state, target: item.target, createdAt: item.createdAt,
      commitSha: item.meta?.githubCommitSha || null, commitMessage: item.meta?.githubCommitMessage || null,
    })),
  }
}

export function createSignalBoostSupervisorConnectorRuntime(): PortableConnectorRuntimePort {
  const vercelAvailable = Boolean(process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID)
  const capabilities = [
    descriptor('health.read'), descriptor('metrics.query'), descriptor('incident.read'),
    descriptor('deployment.read', 'vercel', 'signalboost-vercel', vercelAvailable),
    descriptor('recent_changes.read', 'vercel', 'signalboost-vercel', vercelAvailable),
  ]

  return createPortableConnectorRuntime({
    discovery: {
      async discover(input) {
        if (input.tenantId !== TENANT || input.environmentId !== ENVIRONMENT) return []
        return capabilities
      },
    },
    execution: {
      async execute({ descriptor: selected }) {
        try {
          const data = selected.providerId === 'vercel'
            ? await vercelEvidence(selected.capabilityId)
            : await platformEvidence(selected.capabilityId)
          return { ok: true, providerId: selected.providerId, capabilityId: selected.capabilityId, data, mode: 'live_read' }
        } catch (error) {
          return { ok: false, providerId: selected.providerId, capabilityId: selected.capabilityId, mode: 'live_read_failed', error: error instanceof Error ? error.message : 'connector read failed' }
        }
      },
    },
  })
}

export const SIGNALBOOST_SUPERVISOR_CONNECTOR_TENANT = TENANT
