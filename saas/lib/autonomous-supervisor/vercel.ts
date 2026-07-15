import { createHash, timingSafeEqual } from 'crypto'
import { getVercelDeployments } from '@/lib/hub/deployments-service'
import { routeInfrastructureWrite } from '@/lib/infra-pr/router'
import type { DiagnosticResult, NormalizedIncidentPayload } from './types'

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 8).toUpperCase()
}

export function verifySupervisorWebhookSecret(rawBody: string, supplied: string | null): boolean {
  const secret = process.env.COS_SUPERVISOR_WEBHOOK_SECRET || ''
  if (!secret) return false
  const expected = createHash('sha256').update(`${secret}.${rawBody}`).digest('hex')
  if (!supplied) return false
  const a = Buffer.from(expected)
  const b = Buffer.from(supplied.replace(/^sha256=/, ''))
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function normalizeVercelIncident(input: any): Promise<NormalizedIncidentPayload | null> {
  const type = String(input?.type || input?.trigger || input?.event || '')
  const deployment = input?.payload?.deployment || input?.deployment || input?.data || input?.payload || {}
  const state = String(deployment?.state || deployment?.status || input?.payload?.state || '').toUpperCase()
  if (!/deployment\.error|deployment\.failed|DEPLOYMENT_STATUS/i.test(type) && !['ERROR', 'FAILED'].includes(state)) return null

  const project = String(deployment?.name || input?.project || input?.payload?.project?.name || process.env.VERCEL_PROJECT_NAME || 'signalboost-live')
  const rawLogs = String(input?.raw_logs || input?.logs || deployment?.errorMessage || deployment?.error || input?.payload?.error || '')
  const summary = String(input?.error_summary || deployment?.errorMessage || deployment?.error || rawLogs.split('\n').find((l: string) => /error|failed/i.test(l)) || 'Vercel deployment failed.')
  const timestamp = new Date(input?.createdAt || input?.created_at || input?.timestamp || Date.now()).toISOString()

  let lastSuccessfulDeploy: string | null = input?.context?.last_successful_deploy || null
  const token = process.env.VERCEL_TOKEN || ''
  const projectId = process.env.VERCEL_PROJECT_ID || ''
  if (!lastSuccessfulDeploy && token && projectId) {
    const deps = await getVercelDeployments(process.env.VERCEL_TEAM_ID || '', projectId, token, 20)
    const ready = deps.deployments?.find(d => d.state === 'READY')
    if (ready?.createdAt) lastSuccessfulDeploy = new Date(ready.createdAt).toISOString()
  }

  return {
    incident_id: String(input?.incident_id || `INC-SB-${new Date(timestamp).getUTCFullYear()}-${shortHash(`${project}:${timestamp}:${summary}`)}`),
    timestamp,
    provider: 'Vercel',
    project,
    severity: 'CRITICAL',
    trigger: 'DEPLOYMENT_STATUS',
    error_summary: summary,
    raw_logs: rawLogs,
    context: {
      last_successful_deploy: lastSuccessfulDeploy,
      recent_env_changes: Array.isArray(input?.context?.recent_env_changes) ? input.context.recent_env_changes : [],
      deployment_id: deployment?.id || deployment?.uid || input?.deployment_id || null,
      deployment_url: deployment?.url || input?.deployment_url || null,
    },
  }
}

function envKeyFromDiagnostic(diagnostic: DiagnosticResult, incident: NormalizedIncidentPayload): string | null {
  const joined = [incident.error_summary, incident.raw_logs, diagnostic.diagnosis, ...diagnostic.repair_plan.map(p => p.action)].join('\n')
  const match = joined.match(/\b([A-Z][A-Z0-9_]{2,})\b/g)?.find(k => /KEY|TOKEN|SECRET|ENV|URL|ID/.test(k))
  return match || null
}

export async function dispatchUiAgentBackup(incident: NormalizedIncidentPayload, diagnostic: DiagnosticResult) {
  if (!diagnostic.requires_ui_agent) return { staged: false, message: 'Diagnostic did not require a UI agent.' }
  const key = envKeyFromDiagnostic(diagnostic, incident) || 'UNKNOWN_ENVIRONMENT_VARIABLE'
  const repairedValue = process.env.COS_SUPERVISOR_TEST_REPAIRED_VALUE || 'REPAIRED_SUCCESSFULLY_12345'
  const result = await routeInfrastructureWrite({
    provider: 'vercel',
    actionId: 'vercel.add_env_var',
    verb: 'update',
    role: 'owner',
    title: `Autonomous supervisor repair for ${incident.project}`,
    description: [
      `Incident ${incident.incident_id} requires browser-agent backup for a Vercel environment-variable repair.`,
      'The browser agent must navigate to the Vercel Environment Variables page, fill the repaired value, capture a screenshot, post it to the SignalBoost Hub UI, and hold for owner approval before saving or redeploying.',
      `Diagnosis: ${diagnostic.diagnosis}`,
    ].join('\n\n'),
    payload: {
      key,
      value: repairedValue,
      target: 'production',
      supervisor_incident_id: incident.incident_id,
      execution_mode: 'ui_agent_hold_for_approval',
      approval_gate: 'Approve & Execute required before save/redeploy',
    },
    userId: 'autonomous-supervisor',
  })
  if (!result.ok) return { staged: false, message: result.error || 'Could not stage UI-agent backup.' }
  return { staged: true, prId: result.pr_id, message: result.message || 'UI-agent backup staged for owner approval.' }
}
