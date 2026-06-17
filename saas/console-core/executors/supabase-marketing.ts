// saas/console-core/executors/supabase-marketing.ts
//
// Secondary Supabase project as its own console provider (read-only).
// This card lets an operator browse a SECOND Supabase project — useful when a
// deployment runs more than one platform/database. It is OPTIONAL: when no second
// project is configured the card reports a clean "not connected" state instead of
// an error, so a single-database install never looks broken.
//
// Configuration (Vercel > Settings > Environment Variables, Production scope):
//   SECONDARY_SUPABASE_URL                 e.g. https://<ref>.supabase.co
//   SECONDARY_SUPABASE_SERVICE_ROLE_KEY    the project's SERVICE_ROLE key (secret)
//
// Backward compatibility: the older MARKETING_SUPABASE_URL / _SERVICE_ROLE_KEY
// names are still honoured as a fallback, so existing installs keep working.
//
// Importing this module registers the executors.

import { registerExecutor } from '../defaultHost'
import type { ActionField, ActionSchema } from '../types'

// ─── Key inspection (never exposes the key itself) ────────────────────────────
// Supabase keys come in two shapes:
//   • legacy JWT — base64url payload carrying a `role` claim. 'service_role' is
//     correct (full access); 'anon' is the WRONG key (limited / RLS-bound) and is
//     the single most common setup mistake, since the two JWTs look near-identical.
//   • new format — 'sb_secret_…' (correct) / 'sb_publishable_…' (wrong, public).
function inspectKey(key: string): { role: string | null; wrong: boolean; reason: string | null } {
  if (key.startsWith('sb_secret_')) return { role: 'service', wrong: false, reason: null }
  if (key.startsWith('sb_publishable_')) {
    return { role: 'publishable', wrong: true, reason: 'a PUBLISHABLE key was provided — the SERVICE_ROLE (secret) key is required' }
  }
  const parts = key.split('.')
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
      const role = typeof payload?.role === 'string' ? payload.role : null
      if (role === 'anon') {
        return { role, wrong: true, reason: 'an ANON key was provided — the SERVICE_ROLE (secret) key is required' }
      }
      return { role, wrong: false, reason: null }
    } catch {
      return { role: null, wrong: false, reason: null }
    }
  }
  return { role: null, wrong: false, reason: null }
}

const NOT_CONFIGURED =
  'Secondary Supabase is not connected (optional). To enable, set SECONDARY_SUPABASE_URL and SECONDARY_SUPABASE_SERVICE_ROLE_KEY (the project\u2019s service_role key) in your environment.'

type Creds =
  | { ok: true; url: string; key: string; restBase: string }
  | { ok: false; error: string }

function creds(): Creds {
  const url = process.env.SECONDARY_SUPABASE_URL || process.env.MARKETING_SUPABASE_URL
  const key = process.env.SECONDARY_SUPABASE_SERVICE_ROLE_KEY || process.env.MARKETING_SUPABASE_SERVICE_ROLE_KEY

  // Optional provider: absent config is a clean "not connected" state, not a fault.
  if (!url || !key) return { ok: false, error: NOT_CONFIGURED }

  // Guard the most common mistake before any request goes out, so the card shows
  // an actionable reason instead of a raw "Invalid API key" from PostgREST.
  const info = inspectKey(key)
  if (info.wrong && info.reason) {
    return { ok: false, error: `Secondary Supabase key is the wrong type — ${info.reason}.` }
  }

  const base = url.replace(/\/+$/, '')
  return { ok: true, url: base, key, restBase: `${base}/rest/v1` }
}

const schema = (id: string, label: string, verb: string, fields: ActionField[]): ActionSchema => ({ id, label, verb, fields })

const TABLE: ActionField = {
  id: 'table', label: 'Table', type: 'remote_select', required: true,
  remoteSource: { action: 'supabase_mkt.list_tables', dataPath: 'tables', valueKey: 'name', labelTemplate: '{name}' },
}

// List tables (PostgREST OpenAPI spec — no RPC dependency)
registerExecutor({
  providerId: 'supabase_mkt', actionId: 'list_tables', policyActionId: 'read_provider_status',
  schema: schema('supabase_mkt.list_tables', 'List Tables', 'view', []),
  async run() {
    const c = creds(); if (!c.ok) return c
    const res = await fetch(`${c.restBase}/`, { headers: { apikey: c.key, Authorization: 'Bearer ' + c.key, Accept: 'application/openapi+json' } })
    if (!res.ok) return { ok: false, error: (await res.text()) || 'Failed to list tables' }
    const spec = await res.json()
    const defs = spec && spec.definitions ? Object.keys(spec.definitions) : []
    const tables = defs.filter((n: string) => n && !n.startsWith('(')).map((n: string) => ({ name: n }))
    return { ok: true, message: `${tables.length} table${tables.length === 1 ? '' : 's'}`, data: { count: tables.length, tables } }
  },
})

// List rows for a chosen table
registerExecutor({
  providerId: 'supabase_mkt', actionId: 'list_rows', policyActionId: 'read_provider_status',
  schema: schema('supabase_mkt.list_rows', 'List Rows', 'view', [TABLE]),
  async run(_ctx, input) {
    const c = creds(); if (!c.ok) return c
    const table = String(input.table || ''); if (!table) return { ok: false, error: 'Table is required' }
    const res = await fetch(`${c.restBase}/${encodeURIComponent(table)}?limit=100`, { headers: { apikey: c.key, Authorization: 'Bearer ' + c.key } })
    if (!res.ok) return { ok: false, error: (await res.text()) || 'Failed to list rows' }
    const data = await res.json()
    const list = Array.isArray(data) ? data : []
    const rows = list.map((r: any) => {
      const id = r?.id ?? r?.uuid ?? r?.pk ?? ''
      const friendly = r?.name ?? r?.title ?? r?.email ?? r?.slug ?? r?.label ?? ''
      return { id: String(id), label: friendly ? `${id} — ${friendly}` : String(id) }
    }).filter((r: any) => r.id !== '')
    return { ok: true, message: `${rows.length} row${rows.length === 1 ? '' : 's'}`, data: { count: rows.length, rows } }
  },
})

// List auth users
registerExecutor({
  providerId: 'supabase_mkt', actionId: 'list_users', policyActionId: 'read_provider_status',
  schema: schema('supabase_mkt.list_users', 'List Users', 'view', []),
  async run() {
    const c = creds(); if (!c.ok) return c
    const res = await fetch(`${c.url}/auth/v1/admin/users?per_page=100`, { headers: { apikey: c.key, Authorization: 'Bearer ' + c.key } })
    if (!res.ok) return { ok: false, error: (await res.text()) || 'Failed to list users' }
    const data = await res.json()
    const list = Array.isArray(data?.users) ? data.users : (Array.isArray(data) ? data : [])
    const users = list.map((u: any) => ({ id: u.id, email: u.email || u.id, label: u.email || u.id })).filter((u: any) => u.id)
    return { ok: true, message: `${users.length} user${users.length === 1 ? '' : 's'}`, data: { count: users.length, users } }
  },
})

// List storage buckets
registerExecutor({
  providerId: 'supabase_mkt', actionId: 'list_buckets', policyActionId: 'read_provider_status',
  schema: schema('supabase_mkt.list_buckets', 'List Buckets', 'view', []),
  async run() {
    const c = creds(); if (!c.ok) return c
    const res = await fetch(`${c.url}/storage/v1/bucket`, { headers: { apikey: c.key, Authorization: 'Bearer ' + c.key } })
    if (!res.ok) return { ok: false, error: (await res.text()) || 'Failed to list buckets' }
    const data = await res.json()
    const list = Array.isArray(data) ? data : []
    const buckets = list.map((b: any) => ({ name: b.name || b.id, public: b.public, created_at: b.created_at }))
    return { ok: true, message: `${buckets.length} bucket${buckets.length === 1 ? '' : 's'}`, data: { count: buckets.length, buckets } }
  },
})
