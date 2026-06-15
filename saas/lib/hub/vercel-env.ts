// saas/lib/hub/vercel-env.ts
// Vercel Environment Variables — view / add / edit / delete.
//
// Self-contained helper for the Hub Console "Environment Variables" workspace.
// Talks to the real Vercel REST API. Flat { ok, error? } result style (repo rule:
// tsconfig strict:false — no narrowing unions).
//
// Reads no env here; the caller (the API route) passes token / projectId / teamId.
// teamId is optional. For LIST we try with teamId (if given) and automatically
// retry WITHOUT it on failure — a personal project rejects a team-scoped query,
// and that mismatch was silently returning an empty list before.
// All failures return Vercel's verbatim status + body so the UI can show the cause.

const VERCEL_API = 'https://api.vercel.com'

export type EnvTarget = 'production' | 'preview' | 'development'

export type EnvVar = {
  id: string
  key: string
  type: string // 'system' | 'secret' | 'encrypted' | 'plain' | 'sensitive'
  target: EnvTarget[]
  gitBranch?: string | null
  createdAt?: number
  updatedAt?: number
}

export type ListResult = { ok: boolean; vars?: EnvVar[]; error?: string }
export type MutateResult = { ok: boolean; var?: EnvVar; error?: string }
export type DeleteResult = { ok: boolean; id?: string; error?: string }

// Build the ?teamId=... suffix only when a team is configured.
function qs(teamId?: string): string {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''
}

function baseHeaders(token: string): Record<string, string> {
  return { Authorization: 'Bearer ' + token }
}

// Normalize Vercel's loose target shape (string | string[]) into a clean array.
function normTarget(t: unknown): EnvTarget[] {
  if (Array.isArray(t)) return t as EnvTarget[]
  if (typeof t === 'string' && t) return [t as EnvTarget]
  return []
}

function normVar(e: any): EnvVar {
  return {
    id: String(e?.id || ''),
    key: String(e?.key || ''),
    type: String(e?.type || 'encrypted'),
    target: normTarget(e?.target),
    gitBranch: e?.gitBranch ?? null,
    createdAt: e?.createdAt,
    updatedAt: e?.updatedAt,
  }
}

// ---------------------------------------------------------------------------
// LIST  (with automatic team -> no-team retry, verbatim errors)
// ---------------------------------------------------------------------------
export async function listEnv(
  projectId: string,
  token: string,
  teamId?: string,
): Promise<ListResult> {
  async function call(withTeam: boolean) {
    const url = `${VERCEL_API}/v9/projects/${encodeURIComponent(projectId)}/env${withTeam ? qs(teamId) : ''}`
    return fetch(url, { method: 'GET', headers: baseHeaders(token), cache: 'no-store' })
  }

  try {
    let res = await call(Boolean(teamId))
    // A personal project rejects a team-scoped query — retry without the team.
    if (!res.ok && teamId) {
      res = await call(false)
    }
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: `Vercel env list failed (HTTP ${res.status}): ${e.slice(0, 400)}` }
    }
    const data = await res.json()
    const raw = data.envs || (Array.isArray(data) ? data : [])
    const vars = raw.map(normVar).sort((a: EnvVar, b: EnvVar) => a.key.localeCompare(b.key))
    return { ok: true, vars }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---------------------------------------------------------------------------
// ADD (create)
// ---------------------------------------------------------------------------
export async function addEnv(
  projectId: string,
  token: string,
  input: { key: string; value: string; type?: string; target?: EnvTarget[]; gitBranch?: string },
  teamId?: string,
): Promise<MutateResult> {
  try {
    const key = (input.key || '').trim()
    if (!key) return { ok: false, error: 'Variable key is required' }
    if (input.value === undefined || input.value === '') return { ok: false, error: 'Variable value is required' }

    const target = (input.target && input.target.length ? input.target : ['production']) as EnvTarget[]
    const type = input.type || 'encrypted'

    const body: Record<string, unknown> = { key, value: String(input.value), type, target }
    if (input.gitBranch) body.gitBranch = input.gitBranch

    const res = await fetch(`${VERCEL_API}/v10/projects/${encodeURIComponent(projectId)}/env${qs(teamId)}`, {
      method: 'POST',
      headers: { ...baseHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: `Add failed (HTTP ${res.status}): ${e.slice(0, 400)}` }
    }
    const data = await res.json()
    const created = data.created || data
    return { ok: true, var: normVar(created) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---------------------------------------------------------------------------
// EDIT (patch value and/or target)
// ---------------------------------------------------------------------------
export async function updateEnv(
  projectId: string,
  token: string,
  id: string,
  patch: { value?: string; target?: EnvTarget[]; type?: string; gitBranch?: string },
  teamId?: string,
): Promise<MutateResult> {
  try {
    if (!id) return { ok: false, error: 'Env variable id is required' }

    const body: Record<string, unknown> = {}
    if (patch.value !== undefined && patch.value !== '') body.value = String(patch.value)
    if (patch.target && patch.target.length) body.target = patch.target
    if (patch.type) body.type = patch.type
    if (patch.gitBranch !== undefined) body.gitBranch = patch.gitBranch

    if (Object.keys(body).length === 0) return { ok: false, error: 'Nothing to update' }

    const res = await fetch(`${VERCEL_API}/v9/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(id)}${qs(teamId)}`, {
      method: 'PATCH',
      headers: { ...baseHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: `Update failed (HTTP ${res.status}): ${e.slice(0, 400)}` }
    }
    const data = await res.json()
    return { ok: true, var: normVar(data) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------
export async function deleteEnv(
  projectId: string,
  token: string,
  id: string,
  teamId?: string,
): Promise<DeleteResult> {
  try {
    if (!id) return { ok: false, error: 'Env variable id is required' }
    const res = await fetch(`${VERCEL_API}/v9/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(id)}${qs(teamId)}`, {
      method: 'DELETE',
      headers: baseHeaders(token),
    })
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: `Delete failed (HTTP ${res.status}): ${e.slice(0, 400)}` }
    }
    return { ok: true, id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
