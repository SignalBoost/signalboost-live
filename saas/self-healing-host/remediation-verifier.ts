import { infraAdminClient } from '@/lib/infra-pr/client'

interface PendingVerificationRow {
  recovery_key: string
  affected_resource: string | null
  last_attempted_at: string
  details: Record<string, unknown> | null
}

interface VercelDeploymentRow {
  uid?: string
  id?: string
  readyState?: string
  state?: string
  createdAt?: number
  url?: string
}

export interface RemediationVerificationSweep {
  checked: number
  verified: number
  failed: number
  pending: number
  errors: string[]
}

function vercelConfig(): { token: string; projectId: string; teamId?: string } | null {
  const token = process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN || ''
  const projectId = process.env.VERCEL_PROJECT_ID || ''
  if (!token || !projectId) return null
  return { token, projectId, teamId: process.env.VERCEL_TEAM_ID || undefined }
}

async function recentProductionDeployments(config: { token: string; projectId: string; teamId?: string }): Promise<VercelDeploymentRow[]> {
  const qs = new URLSearchParams({ projectId: config.projectId, target: 'production', limit: '20' })
  if (config.teamId) qs.set('teamId', config.teamId)
  const response = await fetch(`https://api.vercel.com/v6/deployments?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/json' },
    cache: 'no-store',
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body?.error?.message || `Vercel deployments HTTP ${response.status}`)
  return Array.isArray(body?.deployments) ? body.deployments : []
}

/**
 * Verifies pending deployment repairs against the provider itself. A repair is
 * verified only when a newer production deployment reaches READY. A newer
 * terminal ERROR/CANCELED deployment marks the attempt failed; otherwise it
 * remains pending for the next monitoring cycle.
 */
export async function verifyPendingVercelRemediations(limit = 10): Promise<RemediationVerificationSweep> {
  const summary: RemediationVerificationSweep = { checked: 0, verified: 0, failed: 0, pending: 0, errors: [] }
  const admin = infraAdminClient()
  const config = vercelConfig()
  if (!admin.ok || !admin.client) {
    summary.errors.push(admin.error || 'remediation verification store unavailable')
    return summary
  }
  if (!config) {
    summary.errors.push('Vercel verification credentials unavailable')
    return summary
  }

  const { data, error } = await admin.client
    .from('self_healing_remediation_verifications')
    .select('recovery_key,affected_resource,last_attempted_at,details')
    .eq('provider', 'vercel')
    .eq('verification_status', 'pending')
    .order('last_attempted_at', { ascending: true })
    .limit(Math.max(1, Math.min(limit, 20)))
  if (error) {
    summary.errors.push(`pending verification read failed: ${error.message}`)
    return summary
  }

  let deployments: VercelDeploymentRow[]
  try {
    deployments = await recentProductionDeployments(config)
  } catch (error) {
    summary.errors.push(error instanceof Error ? error.message : 'Vercel verification read failed')
    return summary
  }

  for (const row of (data || []) as PendingVerificationRow[]) {
    summary.checked += 1
    const attemptedAt = Date.parse(row.last_attempted_at)
    const candidates = deployments
      .filter(item => Number(item.createdAt || 0) > attemptedAt)
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    const latest = candidates[0]
    if (!latest) {
      summary.pending += 1
      continue
    }

    const state = String(latest.readyState || latest.state || '').toUpperCase()
    const nextStatus = state === 'READY' ? 'verified' : ['ERROR', 'CANCELED', 'CANCELLED'].includes(state) ? 'failed' : null
    if (!nextStatus) {
      summary.pending += 1
      continue
    }

    const deploymentId = String(latest.uid || latest.id || '')
    const details = {
      ...(row.details || {}),
      verification: {
        provider: 'vercel',
        deploymentId,
        deploymentUrl: String(latest.url || ''),
        state,
        checkedAt: new Date().toISOString(),
      },
    }
    const { error: updateError } = await admin.client
      .from('self_healing_remediation_verifications')
      .update({
        verification_status: nextStatus,
        verification_checks: 1,
        last_checked_at: new Date().toISOString(),
        details,
        updated_at: new Date().toISOString(),
      })
      .eq('recovery_key', row.recovery_key)
      .eq('verification_status', 'pending')
    if (updateError) {
      summary.errors.push(`${row.recovery_key}: ${updateError.message}`)
      continue
    }
    if (nextStatus === 'verified') summary.verified += 1
    else summary.failed += 1
  }

  return summary
}
