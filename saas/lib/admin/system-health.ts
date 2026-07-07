import { getVercelDeployments } from '@/lib/hub/deployments-service'
import { resolveVercelProject } from '@/lib/hub/vercel-project'

type PlatformStatus = 'Connected' | 'Healthy' | 'Attention' | 'Error' | 'Not configured'

export type VercelSystemHealth = {
  configured: boolean
  checkedAt: string
  deploymentStatus: PlatformStatus
  failedBuildsStatus: PlatformStatus
  cronStatus: PlatformStatus
  failedBuilds: number | null
  latestDeploymentState: string | null
  latestDeploymentAt: string | null
  cronCount: number | null
  details: {
    deployment: string
    failedBuilds: string
    cron: string
  }
}

export async function getVercelSystemHealth(): Promise<VercelSystemHealth> {
  const now = Date.now()
  if (!cachedHealth || cachedHealth.expires <= now) {
    cachedHealth = { expires: now + 10_000, promise: loadVercelSystemHealth() }
  }
  return cachedHealth.promise
}

const VERCEL_API = 'https://api.vercel.com'
const ERROR_STATES = new Set(['ERROR', 'CANCELED', 'BLOCKED'])
const ACTIVE_STATES = new Set(['BUILDING', 'INITIALIZING', 'QUEUED'])

function teamQs(teamId?: string): string {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''
}

function fmt(ts?: number | string | null): string | null {
  if (!ts) return null
  const n = typeof ts === 'number' ? ts : Number(ts)
  const d = new Date(Number.isFinite(n) ? n : ts)
  if (isNaN(d.getTime())) return null
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function getProjectCronSummary(projectId: string, token: string, teamId?: string): Promise<{ ok: boolean; count?: number; enabled?: boolean; error?: string }> {
  try {
    const res = await fetch(`${VERCEL_API}/v9/projects/${encodeURIComponent(projectId)}${teamQs(teamId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!res.ok) return { ok: false, error: `Vercel project check failed with HTTP ${res.status}` }
    const data = await res.json()
    const definitions = Array.isArray(data?.crons?.definitions) ? data.crons.definitions : []
    const disabled = Boolean(data?.crons?.disabledAt)
    return { ok: true, count: definitions.length, enabled: !disabled }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Cron status check failed' }
  }
}

let cachedHealth: { expires: number; promise: Promise<VercelSystemHealth> } | null = null

async function loadVercelSystemHealth(): Promise<VercelSystemHealth> {
  const checkedAt = new Date().toISOString()
  const creds = await resolveVercelProject()

  if (!creds.ok || !creds.token || !creds.projectId) {
    return {
      configured: false,
      checkedAt,
      deploymentStatus: 'Not configured',
      failedBuildsStatus: 'Not configured',
      cronStatus: 'Not configured',
      failedBuilds: null,
      latestDeploymentState: null,
      latestDeploymentAt: null,
      cronCount: null,
      details: {
        deployment: 'Vercel credentials or project id are not configured server-side.',
        failedBuilds: 'Vercel credentials or project id are not configured server-side.',
        cron: 'Vercel credentials or project id are not configured server-side.',
      },
    }
  }

  const [deploymentsResult, cronResult] = await Promise.all([
    getVercelDeployments(creds.teamId || '', creds.projectId, creds.token, 20),
    getProjectCronSummary(creds.projectId, creds.token, creds.teamId),
  ])

  const deployments = deploymentsResult.ok && Array.isArray(deploymentsResult.deployments) ? deploymentsResult.deployments : []
  const latest = deployments[0]
  const failedBuilds = deployments.filter((d) => ERROR_STATES.has(String(d.state))).length

  let deploymentStatus: PlatformStatus = 'Error'
  let deploymentDetail = deploymentsResult.error || 'Vercel deployment API check failed.'
  if (deploymentsResult.ok) {
    const state = String(latest?.state || 'UNKNOWN')
    deploymentStatus = !latest ? 'Connected' : state === 'READY' ? 'Connected' : ACTIVE_STATES.has(state) ? 'Attention' : 'Error'
    deploymentDetail = latest
      ? `Latest deployment is ${state}${latest.target ? ` (${latest.target})` : ''}${fmt(latest.createdAt) ? ` at ${fmt(latest.createdAt)}` : ''}.`
      : 'Vercel API connected, but no deployments were returned.'
  }

  const failedBuildsStatus: PlatformStatus = deploymentsResult.ok ? (failedBuilds > 0 ? 'Attention' : 'Healthy') : 'Error'
  const failedBuildsDetail = deploymentsResult.ok
    ? `${failedBuilds} failed/canceled/blocked deployment${failedBuilds === 1 ? '' : 's'} in the latest ${deployments.length} checked.`
    : deploymentsResult.error || 'Failed build history could not be checked.'

  let cronStatus: PlatformStatus = 'Error'
  let cronDetail = cronResult.error || 'Vercel cron API check failed.'
  if (cronResult.ok) {
    cronStatus = cronResult.enabled && (cronResult.count ?? 0) > 0 ? 'Healthy' : 'Attention'
    cronDetail = cronResult.enabled
      ? `${cronResult.count ?? 0} cron job${(cronResult.count ?? 0) === 1 ? '' : 's'} configured in Vercel.`
      : 'Vercel cron jobs are disabled for this project.'
  }

  return {
    configured: true,
    checkedAt,
    deploymentStatus,
    failedBuildsStatus,
    cronStatus,
    failedBuilds: deploymentsResult.ok ? failedBuilds : null,
    latestDeploymentState: latest?.state || null,
    latestDeploymentAt: fmt(latest?.createdAt),
    cronCount: cronResult.ok ? cronResult.count ?? 0 : null,
    details: { deployment: deploymentDetail, failedBuilds: failedBuildsDetail, cron: cronDetail },
  }
}
