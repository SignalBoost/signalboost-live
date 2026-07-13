// saas/lib/hub/supabase-projects.ts
// Lists the owner's Supabase projects for the Hub SQL Editor picker and runs
// SQL against a chosen one.
//
// Sources, in order:
//   1. "primary"   — this app's own connection (NEXT_PUBLIC_SUPABASE_URL).
//   2. "secondary" — the marketing project, derived from the SECONDARY_* env
//      vars that the affiliate tools already use. Always offered; needs NO
//      Management API token. SQL runs through the marketing project's own
//      hub_exec_sql RPC via its service-role key (same contract as primary).
//   3. Real projects from the Management API when SUPABASE_ACCESS_TOKEN is
//      configured (token from https://supabase.com/dashboard/account/tokens).
//
// Required env vars (Vercel > signalboost-live > Settings > Environment Variables):
//   SECONDARY_SUPABASE_URL                 e.g. https://<ref>.supabase.co
//   SECONDARY_SUPABASE_SERVICE_ROLE_KEY    the marketing project's service_role key
//   (legacy MARKETING_SUPABASE_URL / _SERVICE_ROLE_KEY are honoured as fallback)
//   SUPABASE_ACCESS_TOKEN                  optional, unlocks the full project list

const MGMT = 'https://api.supabase.com'

export type SupabaseProject = { ref: string; name: string; region?: string }

function refFromUrl(url: string): string {
  return ((url || '').split('//')[1] || '').split('.')[0] || ''
}

function secondaryConfig(): { url: string; key: string; ref: string } | null {
  const url = process.env.SECONDARY_SUPABASE_URL || process.env.MARKETING_SUPABASE_URL || ''
  const key =
    process.env.SECONDARY_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.MARKETING_SUPABASE_SERVICE_ROLE_KEY ||
    ''
  const clean = url.replace(/\/rest\/v1\/?$/, '')
  const ref = refFromUrl(clean)
  if (!clean || !key || !ref) return null
  return { url: clean, key, ref }
}

// Derive a single "primary" entry from the app's own connection so the picker
// always has at least one option even with no Management API token.
function primaryProject(): SupabaseProject[] {
  const ref = refFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
  if (!ref) return []
  return [{ ref: 'primary', name: `Primary — ${ref} (this app)` }]
}

// The marketing project as a static picker entry — available with no token.
function secondaryProject(): SupabaseProject[] {
  const cfg = secondaryConfig()
  if (!cfg) return []
  return [{ ref: 'secondary', name: `Marketing — ${cfg.ref} (secondary)` }]
}

export async function listSupabaseProjects(): Promise<{ ok: boolean; projects?: SupabaseProject[]; error?: string }> {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  const builtIns = [...primaryProject(), ...secondaryProject()]

  if (!token) {
    // No management token → offer the built-in connections.
    return { ok: true, projects: builtIns }
  }

  try {
    const res = await fetch(`${MGMT}/v1/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      // Auth/scope problem → degrade gracefully to the built-ins.
      return builtIns.length ? { ok: true, projects: builtIns } : { ok: false, error: `Management API ${res.status}` }
    }
    const data = await res.json()
    const list = Array.isArray(data) ? data : []
    const projects: SupabaseProject[] = list
      .map((p: any) => ({ ref: p.id || p.ref, name: p.name || p.id, region: p.region }))
      .filter((p: SupabaseProject) => !!p.ref)

    if (!projects.length) return { ok: true, projects: builtIns }

    // Keep the marketing entry visible even when the token belongs to an
    // account that can't see that project; skip it when the real ref is
    // already in the Management API list.
    const cfg = secondaryConfig()
    if (cfg && !projects.some((p) => p.ref === cfg.ref)) {
      projects.push(...secondaryProject())
    }
    return { ok: true, projects }
  } catch (err: any) {
    return builtIns.length ? { ok: true, projects: builtIns } : { ok: false, error: err?.message || 'Management API error' }
  }
}

// Runs SQL against the marketing project through its own gated hub_exec_sql
// RPC — identical contract to the primary path in the hub action route.
async function runSecondarySql(query: string): Promise<{ handled: boolean; ok?: boolean; rows?: any[]; error?: string }> {
  const cfg = secondaryConfig()
  if (!cfg) {
    return {
      handled: true,
      ok: false,
      error: 'Marketing Supabase is not configured (SECONDARY_SUPABASE_URL / SECONDARY_SUPABASE_SERVICE_ROLE_KEY missing in Vercel).',
    }
  }

  try {
    const res = await fetch(`${cfg.url}/rest/v1/rpc/hub_exec_sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key, apikey: cfg.key },
      body: JSON.stringify({ query }),
    })
    const text = await res.text()
    if (!res.ok) {
      const missing = res.status === 404 || /could not find the function|hub_exec_sql/i.test(text)
      return {
        handled: true,
        ok: false,
        error: missing
          ? `The marketing project (${cfg.ref}) does not have the hub_exec_sql function yet. Run the migration saas/supabase/migrations/20260616_fix_hub_exec_sql_ddl.sql once in that project's Supabase dashboard SQL editor, then retry.`
          : text || `Query failed (${res.status})`,
      }
    }
    let data: any = null
    try { data = JSON.parse(text) } catch { data = null }
    if (data && typeof data === 'object' && !Array.isArray(data) && data.error) {
      return { handled: true, ok: false, error: String(data.error) }
    }
    const rows = Array.isArray(data) ? data : (data && typeof data === 'object' ? [data] : [])
    return { handled: true, ok: true, rows }
  } catch (err: any) {
    return { handled: true, ok: false, error: err?.message || 'Marketing project query failed' }
  }
}

// Runs SQL against a chosen project.
// Returns { handled: false } when the caller should use its existing primary
// hub_exec_sql path instead (the "primary" sentinel, or an unknown ref with
// no Management API token).
export async function runProjectSql(
  ref: string,
  query: string,
): Promise<{ handled: boolean; ok?: boolean; rows?: any[]; error?: string }> {
  if (!ref || ref === 'primary') return { handled: false }

  const token = process.env.SUPABASE_ACCESS_TOKEN
  const cfg = secondaryConfig()

  // Marketing project — picked via the "secondary" sentinel or its real ref.
  // The service-role RPC path works with or without a Management token, so it
  // is the default; the Management API is only a fallback when the RPC creds
  // are absent but a token that can reach the project exists.
  if (ref === 'secondary' || (cfg && ref === cfg.ref)) {
    if (cfg) return runSecondarySql(query)
    if (!token) return runSecondarySql(query) // yields the clear "not configured" error
    return runMgmtSql(token, ref === 'secondary' ? '' : ref, query)
  }

  if (!token) return { handled: false }
  return runMgmtSql(token, ref, query)
}

// Management API query endpoint (real project refs only).
async function runMgmtSql(
  token: string,
  ref: string,
  query: string,
): Promise<{ handled: boolean; ok?: boolean; rows?: any[]; error?: string }> {
  if (!ref) return { handled: true, ok: false, error: 'Unknown project reference' }
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
