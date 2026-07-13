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
const RPC_RETRY_DELAYS_MS = [0, 750, 1500]

export type SupabaseProject = { ref: string; name: string; region?: string }

type SqlResult = { handled: boolean; ok?: boolean; rows?: any[]; error?: string }

function refFromUrl(url: string): string {
  return ((url || '').split('//')[1] || '').split('.')[0] || ''
}

function secondaryConfig(): { url: string; key: string; ref: string } | null {
  const url = process.env.SECONDARY_SUPABASE_URL || process.env.MARKETING_SUPABASE_URL || ''
  const key =
    process.env.SECONDARY_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.MARKETING_SUPABASE_SERVICE_ROLE_KEY ||
    ''
  const clean = url.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  const ref = refFromUrl(clean)
  if (!clean || !key || !ref) return null
  return { url: clean, key, ref }
}

function primaryProject(): SupabaseProject[] {
  const ref = refFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
  if (!ref) return []
  return [{ ref: 'primary', name: `Primary — ${ref} (this app)` }]
}

function secondaryProject(): SupabaseProject[] {
  const cfg = secondaryConfig()
  if (!cfg) return []
  return [{ ref: 'secondary', name: `Marketing — ${cfg.ref} (secondary)` }]
}

export async function listSupabaseProjects(): Promise<{ ok: boolean; projects?: SupabaseProject[]; error?: string }> {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  const builtIns = [...primaryProject(), ...secondaryProject()]

  if (!token) return { ok: true, projects: builtIns }

  try {
    const res = await fetch(`${MGMT}/v1/projects`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      return builtIns.length ? { ok: true, projects: builtIns } : { ok: false, error: `Management API ${res.status}` }
    }
    const data = await res.json()
    const list = Array.isArray(data) ? data : []
    const projects: SupabaseProject[] = list
      .map((p: any) => ({ ref: p.id || p.ref, name: p.name || p.id, region: p.region }))
      .filter((p: SupabaseProject) => !!p.ref)

    if (!projects.length) return { ok: true, projects: builtIns }

    const cfg = secondaryConfig()
    if (cfg && !projects.some((p) => p.ref === cfg.ref)) projects.push(...secondaryProject())
    return { ok: true, projects }
  } catch (err: any) {
    return builtIns.length ? { ok: true, projects: builtIns } : { ok: false, error: err?.message || 'Management API error' }
  }
}

function isMissingRpc(status: number, body: string): boolean {
  return status === 404 || /PGRST202|could not find the function|hub_exec_sql/i.test(body)
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) return
  await new Promise(resolve => setTimeout(resolve, ms))
}

async function callSecondaryRpc(
  cfg: { url: string; key: string; ref: string },
  query: string,
): Promise<{ ok: boolean; status: number; text: string }> {
  let last = { ok: false, status: 0, text: '' }

  for (const wait of RPC_RETRY_DELAYS_MS) {
    await delay(wait)
    const res = await fetch(`${cfg.url}/rest/v1/rpc/hub_exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.key}`,
        apikey: cfg.key,
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      body: JSON.stringify({ query }),
      cache: 'no-store',
    })
    const text = await res.text()
    last = { ok: res.ok, status: res.status, text }
    if (res.ok || !isMissingRpc(res.status, text)) return last
  }

  return last
}

async function runSecondarySql(query: string, managementToken?: string): Promise<SqlResult> {
  const cfg = secondaryConfig()
  if (!cfg) {
    return {
      handled: true,
      ok: false,
      error: 'Marketing Supabase is not configured (SECONDARY_SUPABASE_URL / SECONDARY_SUPABASE_SERVICE_ROLE_KEY missing in Vercel).',
    }
  }

  try {
    const rpc = await callSecondaryRpc(cfg, query)

    if (!rpc.ok) {
      if (isMissingRpc(rpc.status, rpc.text) && managementToken) {
        const fallback = await runMgmtSql(managementToken, cfg.ref, query)
        if (fallback.ok) return fallback
      }

      return {
        handled: true,
        ok: false,
        error: isMissingRpc(rpc.status, rpc.text)
          ? `The marketing project (${cfg.ref}) could not expose hub_exec_sql through PostgREST. The function may already exist while the API schema cache is stale. In that project's Supabase SQL editor run: NOTIFY pgrst, 'reload schema'; Then retry. Also confirm SECONDARY_SUPABASE_URL and SECONDARY_SUPABASE_SERVICE_ROLE_KEY belong to the same project.`
          : rpc.text || `Query failed (${rpc.status})`,
      }
    }

    let data: any = null
    try { data = JSON.parse(rpc.text) } catch { data = null }
    if (data && typeof data === 'object' && !Array.isArray(data) && data.error) {
      return { handled: true, ok: false, error: String(data.error) }
    }
    const rows = Array.isArray(data) ? data : (data && typeof data === 'object' ? [data] : [])
    return { handled: true, ok: true, rows }
  } catch (err: any) {
    return { handled: true, ok: false, error: err?.message || 'Marketing project query failed' }
  }
}

export async function runProjectSql(ref: string, query: string): Promise<SqlResult> {
  if (!ref || ref === 'primary') return { handled: false }

  const token = process.env.SUPABASE_ACCESS_TOKEN
  const cfg = secondaryConfig()

  if (ref === 'secondary' || (cfg && ref === cfg.ref)) {
    return runSecondarySql(query, token)
  }

  if (!token) return { handled: false }
  return runMgmtSql(token, ref, query)
}

async function runMgmtSql(token: string, ref: string, query: string): Promise<SqlResult> {
  if (!ref) return { handled: true, ok: false, error: 'Unknown project reference' }
  try {
    const res = await fetch(`${MGMT}/v1/projects/${encodeURIComponent(ref)}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      cache: 'no-store',
    })
    const text = await res.text()
    if (!res.ok) return { handled: true, ok: false, error: text || `Query failed (${res.status})` }
    let data: any = []
    try { data = JSON.parse(text) } catch { data = [] }
    const rows = Array.isArray(data) ? data : (Array.isArray(data?.result) ? data.result : [])
    return { handled: true, ok: true, rows }
  } catch (err: any) {
    return { handled: true, ok: false, error: err?.message || 'Management API query failed' }
  }
}
