// saas/console-core/executors/supabase-marketing.ts
//
// Second Supabase project (the MARKETING database) as its own console provider.
// Read-only. Mirrors the main Supabase read handlers but points at the marketing
// project env vars. Importing this module registers the executors.

import { registerExecutor } from '../defaultHost'
import type { ActionField, ActionSchema } from '../types'

function creds(): { ok: true; url: string; key: string; restBase: string } | { ok: false; error: string } {
  const url = process.env.MARKETING_SUPABASE_URL
  const key = process.env.MARKETING_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { ok: false, error: 'Marketing Supabase not configured — set MARKETING_SUPABASE_URL and MARKETING_SUPABASE_SERVICE_ROLE_KEY' }
  return { ok: true, url, key, restBase: `${url}/rest/v1` }
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
