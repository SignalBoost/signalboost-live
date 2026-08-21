// saas/console-core/executors/supabase-marketing.ts
//
// Secondary Supabase project as its own console provider.
// This card lets an operator browse the SECOND Supabase project and owns the
// affiliate partner write pipeline. affiliate_partners must never be written
// through the primary Supabase connection.
//
// Configuration (Vercel > Settings > Environment Variables, Production scope):
//   SECONDARY_SUPABASE_URL                 e.g. https://<ref>.supabase.co
//   SECONDARY_SUPABASE_SERVICE_ROLE_KEY    the project's SERVICE_ROLE key (secret)
//
// Backward compatibility: the older MARKETING_SUPABASE_URL / _SERVICE_ROLE_KEY
// names are still honoured as a fallback, so existing installs keep working.
//
// Importing this module registers the executors.

import { registerExecutor } from '../defaultHost.ts'
import { getSecret } from '../secrets.ts'
import type { ActionField, ActionSchema } from '../types.ts'

// ─── Key inspection (never exposes the key itself) ────────────────────────────
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
  'Secondary Supabase is not connected. Set SECONDARY_SUPABASE_URL and SECONDARY_SUPABASE_SERVICE_ROLE_KEY (or the legacy MARKETING_* equivalents).'

type Creds =
  | { ok: true; url: string; key: string; restBase: string }
  | { ok: false; error: string }

function creds(): Creds {
  const url = getSecret('SECONDARY_SUPABASE_URL') || getSecret('MARKETING_SUPABASE_URL')
  const key = getSecret('SECONDARY_SUPABASE_SERVICE_ROLE_KEY') || getSecret('MARKETING_SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !key) return { ok: false, error: NOT_CONFIGURED }

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

// Affiliate partner single-source-of-truth write path.
// Uses a direct PostgREST upsert against SECONDARY only; there is no primary fallback.
registerExecutor({
  providerId: 'supabase_mkt', actionId: 'upsert_partner', policyActionId: 'table_crud',
  schema: schema('supabase_mkt.upsert_partner', 'Add / Update Affiliate Partner', 'upsert', [
    { id: 'id', label: 'Partner ID', type: 'text', required: true },
    { id: 'name', label: 'Partner Name', type: 'text', required: true },
    { id: 'url', label: 'Affiliate URL', type: 'text', required: true },
    { id: 'network', label: 'Network', type: 'text', required: false },
    { id: 'category', label: 'Category', type: 'text', required: false },
    { id: 'category_label', label: 'Category Label', type: 'text', required: false },
    { id: 'regions', label: 'Regions JSON', type: 'textarea', required: false },
    { id: 'description', label: 'Description', type: 'textarea', required: false },
  ]),
  async run(_ctx, input) {
    const c = creds(); if (!c.ok) return c

    const id = String(input.id || '').trim()
    const name = String(input.name || '').trim()
    const url = String(input.url || '').trim()
    if (!id || !name || !url) return { ok: false, error: 'Partner ID, name, and affiliate URL are required' }

    const category = String(input.category || 'specialty_other').trim() || 'specialty_other'
    const categoryLabel = String(input.category_label || '').trim()
    const network = String(input.network || '').trim()
    const description = String(input.description || '').trim()
    let regions = '["ot"]'
    if (input.regions !== undefined && input.regions !== null && String(input.regions).trim()) {
      try {
        const parsed = JSON.parse(String(input.regions))
        if (!Array.isArray(parsed)) return { ok: false, error: 'Regions must be a JSON array, for example ["ot"]' }
        regions = JSON.stringify(parsed)
      } catch {
        return { ok: false, error: 'Regions must be valid JSON, for example ["ot"]' }
      }
    }

    const row = {
      id,
      name,
      url,
      network: network || null,
      category,
      category_key: category,
      category_label: categoryLabel || null,
      description: description || null,
      regions,
      updated_at: new Date().toISOString(),
    }

    const res = await fetch(`${c.restBase}/affiliate_partners?on_conflict=id`, {
      method: 'POST',
      headers: {
        apikey: c.key,
        Authorization: 'Bearer ' + c.key,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(row),
    })
    if (!res.ok) return { ok: false, error: (await res.text()) || 'Partner upsert failed' }
    const data = await res.json().catch(() => [])
    const saved = Array.isArray(data) ? data[0] : data
    return {
      ok: true,
      message: `Partner saved to secondary Supabase: ${name}`,
      data: { id: saved?.id || id, name: saved?.name || name, source: 'secondary-supabase' },
    }
  },
})

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
