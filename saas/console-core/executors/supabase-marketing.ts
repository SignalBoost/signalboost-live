// saas/console-core/executors/supabase-marketing.ts
//
// Secondary Supabase project as its own console provider and the authoritative
// affiliate partner datastore. Generic Supabase Insert Row stays available, but
// affiliate_partners is force-routed to secondary and can never fall back to primary.

import { registerExecutor } from '../defaultHost.ts'
import { getSecret } from '../secrets.ts'
import type { ActionField, ActionSchema } from '../types.ts'

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

function makeCreds(url: string, key: string, missingMessage: string): Creds {
  if (!url || !key) return { ok: false, error: missingMessage }
  const info = inspectKey(key)
  if (info.wrong && info.reason) return { ok: false, error: `Supabase key is the wrong type — ${info.reason}.` }
  const base = url.replace(/\/+$/, '')
  return { ok: true, url: base, key, restBase: `${base}/rest/v1` }
}

function creds(): Creds {
  return makeCreds(
    getSecret('SECONDARY_SUPABASE_URL') || getSecret('MARKETING_SUPABASE_URL'),
    getSecret('SECONDARY_SUPABASE_SERVICE_ROLE_KEY') || getSecret('MARKETING_SUPABASE_SERVICE_ROLE_KEY'),
    NOT_CONFIGURED,
  )
}

function primaryCreds(): Creds {
  return makeCreds(
    getSecret('NEXT_PUBLIC_SUPABASE_URL'),
    getSecret('SUPABASE_SERVICE_ROLE_KEY'),
    'Primary Supabase is not configured.',
  )
}

const schema = (id: string, label: string, verb: string, fields: ActionField[]): ActionSchema => ({ id, label, verb, fields })

const TABLE: ActionField = {
  id: 'table', label: 'Table', type: 'remote_select', required: true,
  remoteSource: { action: 'supabase_mkt.list_tables', dataPath: 'tables', valueKey: 'name', labelTemplate: '{name}' },
}

async function postRows(c: Extract<Creds, { ok: true }>, table: string, row: unknown, upsert: boolean) {
  const suffix = upsert ? '?on_conflict=id' : ''
  const prefer = upsert ? 'resolution=merge-duplicates,return=representation' : 'return=representation'
  const res = await fetch(`${c.restBase}/${encodeURIComponent(table)}${suffix}`, {
    method: 'POST',
    headers: {
      apikey: c.key,
      Authorization: 'Bearer ' + c.key,
      'Content-Type': 'application/json',
      Prefer: prefer,
    },
    body: JSON.stringify(row),
  })
  if (!res.ok) return { ok: false as const, error: (await res.text()) || 'Insert failed' }
  const data = await res.json().catch(() => [])
  return { ok: true as const, data }
}

// Existing Console Hub "Supabase → Insert Row" action.
// The table decides the database: affiliate_partners -> SECONDARY; everything
// else -> PRIMARY. The partner branch is fail-closed and has no primary fallback.
registerExecutor({
  providerId: 'supabase', actionId: 'insert_row', policyActionId: 'table_crud',
  schema: schema('supabase.insert_row', 'Insert Row', 'insert', [
    { id: 'table', label: 'Table', type: 'text', required: true },
    { id: 'data', label: 'JSON Row Object', type: 'textarea', required: true },
  ]),
  async run(_ctx, input) {
    const table = String(input.table || '').trim()
    if (!table) return { ok: false, error: 'Table is required' }

    let row: unknown
    try { row = JSON.parse(String(input.data || '{}')) }
    catch { return { ok: false, error: 'Data must be valid JSON' } }

    const isPartner = table === 'affiliate_partners'
    const c = isPartner ? creds() : primaryCreds()
    if (!c.ok) return c

    const result = await postRows(c, table, row, isPartner)
    if (!result.ok) return result
    return {
      ok: true,
      message: isPartner
        ? 'Partner saved to secondary Supabase affiliate_partners'
        : `Row inserted into primary Supabase ${table}`,
      data: { rows: result.data, source: isPartner ? 'secondary-supabase' : 'primary-supabase' },
    }
  },
})

// Dedicated structured partner action. This is optional convenience; it reaches
// the same secondary-only source of truth as the generic Insert Row path above.
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

    const result = await postRows(c, 'affiliate_partners', row, true)
    if (!result.ok) return result
    const saved = Array.isArray(result.data) ? result.data[0] : result.data
    return {
      ok: true,
      message: `Partner saved to secondary Supabase: ${name}`,
      data: { id: saved?.id || id, name: saved?.name || name, source: 'secondary-supabase' },
    }
  },
})

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
