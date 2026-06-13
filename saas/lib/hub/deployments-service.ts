// saas/lib/hub/deployments-service.ts
// Vercel deployment history and status

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
    const res = await fetch(
      `https://api.vercel.com/v6/deployments?teamId=${teamId}&projectId=${projectId}&limit=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
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
    const res = await fetch(`https://api.vercel.com/v13/deployments/${deploymentId}?teamId=${teamId}`, {
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
 * Rollback to previous deployment
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
    const res = await fetch(
      `https://api.vercel.com/v13/projects/${projectId}/deployments/${deploymentId}/promote?teamId=${teamId}`,
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

    const data = await res.json()
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}
