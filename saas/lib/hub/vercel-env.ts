// saas/lib/hub/vercel-env.ts
// Vercel Environment Variables — view / add / edit / delete.
//
// Self-contained helper for the Hub Console "Environment Variables" workspace.
// Talks to the real Vercel REST API. Flat { ok, error? } result style (repo rule:
// tsconfig strict:false — no narrowing unions).
//
// Reads no env here; the caller (the API route) passes token / projectId / teamId.
// teamId is optional: only appended when the project lives under a Vercel team.

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
// LIST
// ---------------------------------------------------------------------------
export async function listEnv(
  projectId: string,
  token: string,
  teamId?: string,
): Promise<ListResult> {
  try {
    const res = await fetch(`${VERCEL_API}/v9/projects/${projectId}/env${qs(teamId)}`, {
      method: 'GET',
      headers: baseHeaders(token),
      cache: 'no-store',
    })
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: `List failed (${res.status}): ${e}` }
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

    // v10 supports upsert + returns the created record.
    const res = await fetch(`${VERCEL_API}/v10/projects/${projectId}/env${qs(teamId)}`, {
      method: 'POST',
      headers: { ...baseHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: `Add failed (${res.status}): ${e}` }
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

    const res = await fetch(`${VERCEL_API}/v9/projects/${projectId}/env/${encodeURIComponent(id)}${qs(teamId)}`, {
      method: 'PATCH',
      headers: { ...baseHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: `Update failed (${res.status}): ${e}` }
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
    const res = await fetch(`${VERCEL_API}/v9/projects/${projectId}/env/${encodeURIComponent(id)}${qs(teamId)}`, {
      method: 'DELETE',
      headers: baseHeaders(token),
    })
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: `Delete failed (${res.status}): ${e}` }
    }
    return { ok: true, id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
