// saas/lib/autonomous-supervisor/vercel.ts
import { createHash, createHmac, timingSafeEqual } from 'crypto'
import { getVercelDeployments } from '@/lib/hub/deployments-service'
import { stageInfrastructurePR } from '@/lib/hub/pr-engine'
import type { DiagnosticResult, NormalizedIncidentPayload } from './types'

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 8).toUpperCase()
}

function equalHex(expected: string, supplied: string | null): boolean {
  if (!supplied) return false
  const normalized = supplied.replace(/^sha(1|256)=/i, '').trim().toLowerCase()
  if (!/^[a-f0-9]+$/.test(normalized) || normalized.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(normalized, 'hex'))
}

export function verifyVercelWebhookSignature(rawBody: string, supplied: string | null): boolean {
  const secret = process.env.COS_SUPERVISOR_WEBHOOK_SECRET || ''
  if (!secret) return false
  return equalHex(createHmac('sha1', secret).update(rawBody).digest('hex'), supplied)
}

export function verifySignalBoostSupervisorSignature(rawBody: string, supplied: string | null): boolean {
  const secret = process.env.COS_SUPERVISOR_WEBHOOK_SECRET || ''
  if (!secret) return false
  return equalHex(createHmac('sha256', secret).update(rawBody).digest('hex'), supplied)
}

export async function normalizeVercelIncident(input: any): Promise<NormalizedIncidentPayload | null> {
  const type = String(input?.type || input?.trigger || input?.event || '')
  const deployment = input?.payload?.deployment || input?.deployment || input?.data || input?.payload || {}
  const state = String(deployment?.state || deployment?.status || input?.payload?.state || '').toUpperCase()
  if (!/deployment\.error|deployment\.failed|DEPLOYMENT_STATUS/i.test(type) && !['ERROR', 'FAILED'].includes(state)) return null

  const project = String(deployment?.name || input?.project || input?.payload?.project?.name || process.env.VERCEL_PROJECT_NAME || 'signalboost-live')
  const rawLogs = String(input?.raw_logs || input?.logs || deployment?.errorMessage || deployment?.error || input?.payload?.error || '')
  const summary = String(input?.error_summary || deployment?.errorMessage || deployment?.error || rawLogs.split('\n').find((line: string) => /error|failed/i.test(line)) || 'Vercel deployment failed.')
  const timestamp = new Date(input?.createdAt || input?.created_at || input?.timestamp || Date.now()).toISOString()

  let lastSuccessfulDeploy: string | null = input?.context?.last_successful_deploy || null
  const token = process.env.VERCEL_TOKEN || ''
  const projectId = process.env.VERCEL_PROJECT_ID || ''
  if (!lastSuccessfulDeploy && token && projectId) {
    const deps = await getVercelDeployments(process.env.VERCEL_TEAM_ID || '', projectId, token, 20)
    const ready = deps.deployments?.find(deploymentItem => deploymentItem.state === 'READY')
    if (ready?.createdAt) lastSuccessfulDeploy = new Date(ready.createdAt).toISOString()
  }

  return {
    // STABLE BY ROOT CAUSE, not by moment. The timestamp used to be part of this hash, so
    // one broken commit produced a NEW incident id for every failed build — nine approval
    // PRs for a single unterminated string. Hashing project + error summary means repeated
    // failures of the same cause collapse onto one incident, which is what makes the
    // downstream PR fingerprint dedupe work at all.
    incident_id: String(input?.incident_id || `INC-SB-${new Date(timestamp).getUTCFullYear()}-${shortHash(`${project}:${summary}`)}`),
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

export async function stageApprovedInvestigation(incident: NormalizedIncidentPayload, diagnostic: DiagnosticResult) {
  if (!diagnostic.requires_ui_agent) {
    return { staged: false, mode: 'not_required' as const, message: 'The validated diagnosis does not require a UI agent.' }
  }

  const result = await stageInfrastructurePR({
    title: `Supervisor investigation for ${incident.project}`,
    summary: [
      `Incident: ${incident.incident_id}`,
      `Diagnosis: ${diagnostic.diagnosis}`,
      'This approval authorizes read-only inspection of Vercel environment-variable names and targets only.',
      'It does not authorize entering values, saving changes, redeploying, exposing secrets, or launching an unconfigured browser runner.',
      'A separate bounded approval is required before any production-changing executor action.',
    ].join('\n\n'),
    risk: diagnostic.risk_level === 'low' ? 'low' : diagnostic.risk_level === 'medium' ? 'medium' : 'high',
    steps: [{
      provider: 'vercel',
      templateId: 'vercel.view_env',
      label: `Read-only Vercel environment inspection for ${incident.incident_id}`,
      payload: { supervisor_incident_id: incident.incident_id, inspection_only: true },
    }],
    createdBy: 'autonomous-supervisor',
    createdByEmail: null,
  })

  if (!result.ok || !result.pr) {
    return { staged: false, mode: 'unavailable' as const, message: result.error || 'Could not stage the investigation in the active Infrastructure PR cockpit.' }
  }
  return {
    staged: true,
    mode: 'approval_review' as const,
    prId: result.pr.id,
    message: result.duplicate ? 'An identical read-only investigation is already awaiting approval.' : 'Read-only investigation staged in the active Infrastructure PR cockpit.',
  }
}
