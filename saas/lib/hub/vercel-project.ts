// saas/lib/hub/vercel-project.ts
// Shared Vercel credential + project-id resolver for the Hub Console.
//
// Every Vercel-backed route (env, deployments, domains) needs the same two
// things: a token and a project id. The old code read process.env.VERCEL_HUB_PROJECT
// directly in each route, so if that single var was unset the panel came back
// empty even though the token worked. This centralizes resolution so every route
// resolves the project id the same robust way:
//
//   1. VERCEL_HUB_PROJECT   (explicit override — wins if set)
//   2. VERCEL_PROJECT_ID    (Vercel's own system env var for THIS project, present
//                            at runtime when "Automatically expose System Environment
//                            Variables" is enabled — the Vercel default)
//   3. Token auto-discovery via GET /v9/projects. Exactly one project visible to
//      the token -> use it. Several -> error lists every name + prj_… so the right
//      one can be pinned in VERCEL_HUB_PROJECT.
//
// teamId is optional (personal projects have none). It is read from VERCEL_TEAM_ID
// (or VERCEL_TEAM) and simply omitted downstream when empty.
//
// Flat { ok, error? } result style — repo rule, tsconfig strict:false.

const VERCEL_API = 'https://api.vercel.com'

// In-process cache so token-based discovery runs at most once per cold start.
let cachedProjectId: string | null = null

export type VercelCreds = {
  ok: boolean
  token?: string
  projectId?: string
  teamId?: string
  error?: string
}

function qs(teamId?: string): string {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''
}

async function discoverProjectId(
  token: string,
  teamId?: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  async function call(withTeam: boolean) {
    const url = `${VERCEL_API}/v9/projects${withTeam ? qs(teamId) : ''}`
    return fetch(url, { method: 'GET', headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' })
  }

  try {
    let res = await call(Boolean(teamId))
    if (!res.ok && teamId) res = await call(false)
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: `Could not list Vercel projects (HTTP ${res.status}): ${e.slice(0, 300)}` }
    }
    const data = await res.json()
    const projects: any[] = Array.isArray(data?.projects) ? data.projects : (Array.isArray(data) ? data : [])
    if (projects.length === 0) return { ok: false, error: 'No Vercel projects are visible to this token.' }
    if (projects.length === 1) return { ok: true, id: String(projects[0]?.id || '') }
    const list = projects.slice(0, 20).map((p) => `  ${String(p?.name || '?')} = ${String(p?.id || '?')}`).join('\n')
    return {
      ok: false,
      error:
        `This token can see ${projects.length} projects, so I can't auto-pick one. ` +
        `Set VERCEL_HUB_PROJECT in Vercel to the correct prj_… below, then redeploy:\n${list}`,
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Project discovery failed' }
  }
}

// Resolve { token, projectId, teamId } for any Vercel route. Caches the discovered id.
export async function resolveVercelProject(): Promise<VercelCreds> {
  const token = process.env.VERCEL_TOKEN
  const teamId = process.env.VERCEL_TEAM_ID || process.env.VERCEL_TEAM || undefined

  if (!token) {
    return { ok: false, error: 'Vercel not configured — set VERCEL_TOKEN in Vercel env, then redeploy' }
  }

  const explicit = process.env.VERCEL_HUB_PROJECT || process.env.VERCEL_PROJECT_ID || undefined
  if (explicit) return { ok: true, token, projectId: explicit, teamId }
  if (cachedProjectId) return { ok: true, token, projectId: cachedProjectId, teamId }

  const found = await discoverProjectId(token, teamId)
  if (found.ok && found.id) {
    cachedProjectId = found.id
    return { ok: true, token, projectId: found.id, teamId }
  }
  return { ok: false, error: found.error || 'Could not resolve Vercel project id' }
}
