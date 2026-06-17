// saas/lib/hub/supabase-projects.ts
// Lists the owner's real Supabase projects (Management API) and runs SQL
// against a chosen one. Falls back to the primary connection when no
// SUPABASE_ACCESS_TOKEN is configured, so the SQL Editor never breaks.
//
// Token: a Supabase personal access token from
// https://supabase.com/dashboard/account/tokens  (env: SUPABASE_ACCESS_TOKEN)

const MGMT = 'https://api.supabase.com'

export type SupabaseProject = { ref: string; name: string; region?: string }

// Derive a single "primary" entry from the app's own connection so the picker
// always has at least one option even with no Management API token.
function primaryProject(): SupabaseProject[] {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const ref = (url.split('//')[1] || '').split('.')[0] || ''
  if (!ref) return []
  return [{ ref: 'primary', name: `Primary — ${ref} (this app)` }]
}

export async function listSupabaseProjects(): Promise<{ ok: boolean; projects?: SupabaseProject[]; error?: string }> {
  const token = process.env.SUPABASE_ACCESS_TOKEN

  if (!token) {
    // No management token → offer just the primary connection.
    return { ok: true, projects: primaryProject() }
  }

  try {
    const res = await fetch(`${MGMT}/v1/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      // Auth/scope problem → degrade gracefully to primary.
      const prim = primaryProject()
      return prim.length ? { ok: true, projects: prim } : { ok: false, error: `Management API ${res.status}` }
    }
    const data = await res.json()
    const list = Array.isArray(data) ? data : []
    const projects: SupabaseProject[] = list
      .map((p: any) => ({ ref: p.id || p.ref, name: p.name || p.id, region: p.region }))
      .filter((p: SupabaseProject) => !!p.ref)

    if (projects.length) return { ok: true, projects }
    return { ok: true, projects: primaryProject() }
  } catch (err: any) {
    const prim = primaryProject()
    return prim.length ? { ok: true, projects: prim } : { ok: false, error: err?.message || 'Management API error' }
  }
}

// Runs SQL against a chosen project via the Management API query endpoint.
// Returns { handled: false } when the caller should use its existing primary
// hub_exec_sql path instead (no token, or the "primary" sentinel was chosen).
export async function runProjectSql(
  ref: string,
  query: string,
): Promise<{ handled: boolean; ok?: boolean; rows?: any[]; error?: string }> {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token || !ref || ref === 'primary') {
    return { handled: false }
  }

  try {
    const res = await fetch(`${MGMT}/v1/projects/${encodeURIComponent(ref)}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    const text = await res.text()
    if (!res.ok) {
      return { handled: true, ok: false, error: text || `Query failed (${res.status})` }
    }
    let data: any = []
    try { data = JSON.parse(text) } catch { data = [] }
    const rows = Array.isArray(data) ? data : (Array.isArray(data?.result) ? data.result : [])
    return { handled: true, ok: true, rows }
  } catch (err: any) {
    return { handled: true, ok: false, error: err?.message || 'Management API query failed' }
  }
}
