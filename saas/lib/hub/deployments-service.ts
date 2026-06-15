// saas/lib/hub/deployments-service.ts
// Vercel deployment history, status, rollback (promote), and cancel.
// Flat { ok, error? } result style (repo rule: tsconfig strict:false).

export interface Deployment {
  id: string
  url: string
  name: string
  state: 'BUILDING' | 'ERROR' | 'INITIALIZING' | 'QUEUED' | 'READY' | 'CANCELED'
  createdAt: number
  createdBy?: string
  env?: Record<string, string>
  meta?: {
    githubCommitSha?: string
    githubCommitRef?: string
    githubCommitAuthorName?: string
    githubCommitMessage?: string
  }
  target?: string
  alias?: string[]
  inspectorUrl?: string
}

export interface DeploymentsResponse {
  ok: boolean
  deployments?: Deployment[]
  total?: number
  error?: string
}

// Build the ?teamId=... suffix only when a team is configured.
function teamQs(teamId?: string): string {
  return teamId ? `teamId=${encodeURIComponent(teamId)}` : ''
}

/**
 * Fetch deployments from Vercel
 */
export async function getVercelDeployments(
  teamId: string,
  projectId: string,
  token: string,
  limit: number = 20
): Promise<DeploymentsResponse> {
  try {
    const parts = [teamQs(teamId), `projectId=${encodeURIComponent(projectId)}`, `limit=${limit}`].filter(Boolean)
    const res = await fetch(
      `https://api.vercel.com/v6/deployments?${parts.join('&')}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      }
    )

    if (!res.ok) {
      const error = await res.text()
      return { ok: false, error: `Failed to fetch deployments: ${error}` }
    }

    const data = await res.json()
    const deployments: Deployment[] = (data.deployments || []).map((d: any) => ({
      id: d.uid,
      url: d.url,
      name: d.name || 'Deployment',
      state: d.state,
      createdAt: d.createdAt,
      createdBy: d.creator?.email,
      env: d.env,
      meta: d.meta,
      target: d.target,
      alias: d.alias,
      inspectorUrl: d.inspectorUrl,
    }))

    return {
      ok: true,
      deployments,
      total: data.pagination?.total || deployments.length,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

/**
 * Get deployment details
 */
export async function getDeploymentDetails(
  deploymentId: string,
  teamId: string,
  token: string
): Promise<{
  ok: boolean
  deployment?: Deployment & { builds?: any[]; checks?: any[] }
  error?: string
}> {
  try {
    const qs = teamQs(teamId)
    const res = await fetch(`https://api.vercel.com/v13/deployments/${deploymentId}${qs ? '?' + qs : ''}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!res.ok) {
      const error = await res.text()
      return { ok: false, error: `Failed to get deployment: ${error}` }
    }

    const data = await res.json()
    const deployment: Deployment & { builds?: any[]; checks?: any[] } = {
      id: data.uid,
      url: data.url,
      name: data.name || 'Deployment',
      state: data.state,
      createdAt: data.createdAt,
      createdBy: data.creator?.email,
      env: data.env,
      meta: data.meta,
      target: data.target,
      alias: data.alias,
      inspectorUrl: data.inspectorUrl,
      builds: data.builds,
      checks: data.checks,
    }

    return { ok: true, deployment }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

/**
 * Rollback to a previous deployment by promoting it back to production.
 */
export async function rollbackDeployment(
  projectId: string,
  deploymentId: string,
  teamId: string,
  token: string
): Promise<{
  ok: boolean
  deployment?: Deployment
  error?: string
}> {
  try {
    const qs = teamQs(teamId)
    const res = await fetch(
      `https://api.vercel.com/v13/projects/${projectId}/deployments/${deploymentId}/promote${qs ? '?' + qs : ''}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!res.ok) {
      const error = await res.text()
      return { ok: false, error: `Rollback failed: ${error}` }
    }

    await res.json().catch(() => null)
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

/**
 * Cancel an in-progress build/deployment.
 * Real Vercel endpoint: PATCH /v12/deployments/{id}/cancel
 */
export async function cancelDeployment(
  deploymentId: string,
  teamId: string,
  token: string
): Promise<{
  ok: boolean
  state?: string
  error?: string
}> {
  try {
    if (!deploymentId) return { ok: false, error: 'Deployment ID is required' }
    const qs = teamQs(teamId)
    const res = await fetch(
      `https://api.vercel.com/v12/deployments/${deploymentId}/cancel${qs ? '?' + qs : ''}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!res.ok) {
      const error = await res.text()
      return { ok: false, error: `Cancel failed: ${error}` }
    }

    const data = await res.json().catch(() => ({}))
    return { ok: true, state: data?.state || 'CANCELED' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}
