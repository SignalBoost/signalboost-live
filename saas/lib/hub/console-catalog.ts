// saas/console-core/executors/resend.ts
import { registerExecutor } from '../defaultHost'
import type { ActionSchema } from '../types'
import { createClient } from '@supabase/supabase-js'

const API = 'https://api.resend.com'
function key(): string | null { return process.env.RESEND_API_KEY || null }
async function getJSON(path: string) {
  const k = key(); if (!k) return { ok: false as const, error: 'RESEND_API_KEY not set' }
  const res = await fetch(`${API}${path}`, { headers: { Authorization: 'Bearer ' + k } })
  if (!res.ok) return { ok: false as const, error: `Resend error (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}` }
  return { ok: true as const, json: await res.json() }
}
const schema = (id: string, label: string, verb: string): ActionSchema => ({ id, label, verb, fields: [] })
const rows = (j: any): any[] => Array.isArray(j) ? j : (j.data || [])

registerExecutor({
  providerId: 'resend', actionId: 'list_domains', policyActionId: 'read_provider_status',
  schema: schema('resend.list_domains', 'List Domains', 'view'),
  async run() {
    const r = await getJSON('/domains'); if (!r.ok) return r
    const domains = rows(r.json).map((d: any) => ({ id: d.id, name: d.name, status: d.status, region: d.region, created_at: d.created_at }))
    return { ok: true, message: `${domains.length} domain${domains.length === 1 ? '' : 's'}`, data: { count: domains.length, domains } }
  },
})
registerExecutor({
  providerId: 'resend', actionId: 'list_audiences', policyActionId: 'read_provider_status',
  schema: schema('resend.list_audiences', 'List Audiences', 'view'),
  async run() {
    const r = await getJSON('/audiences'); if (!r.ok) return r
    const audiences = rows(r.json).map((a: any) => ({ id: a.id, name: a.name, created_at: a.created_at }))
    return { ok: true, message: `${audiences.length} audience${audiences.length === 1 ? '' : 's'}`, data: { count: audiences.length, audiences } }
  },
})
registerExecutor({
  providerId: 'resend', actionId: 'list_broadcasts', policyActionId: 'read_provider_status',
  schema: schema('resend.list_broadcasts', 'List Broadcasts', 'view'),
  async run() {
    const r = await getJSON('/broadcasts'); if (!r.ok) return r
    const broadcasts = rows(r.json).map((b: any) => ({ id: b.id, name: b.name, status: b.status, created_at: b.created_at }))
    return { ok: true, message: `${broadcasts.length} broadcast${broadcasts.length === 1 ? '' : 's'}`, data: { count: broadcasts.length, broadcasts } }
  },
})
registerExecutor({
  providerId: 'resend', actionId: 'list_api_keys', policyActionId: 'read_provider_status',
  schema: schema('resend.list_api_keys', 'List API Keys', 'view'),
  async run() {
    const r = await getJSON('/api-keys'); if (!r.ok) return r
    const keys = rows(r.json).map((k: any) => ({ id: k.id, name: k.name, created_at: k.created_at }))
    return { ok: true, message: `${keys.length} API key${keys.length === 1 ? '' : 's'}`, data: { count: keys.length, keys } }
  },
})

// ── Live delivery list ───────────────────────────────────────────────────────
// Resend has no "list all sent emails" API, so the sent list is built from our
// own outreach_sends records joined to the delivery state the webhook captured
// in email_delivery_status. Reads via the service role (admin-only data).
function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !svc) return null
  return createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false } })
}
function deriveStatus(st: any): string {
  if (!st) return 'sent'
  if (st.bounced_at) return 'bounced'
  if (st.complained_at) return 'complained'
  if (st.delivered_at) return 'delivered'
  return st.last_event || 'sent'
}
registerExecutor({
  providerId: 'resend', actionId: 'email_deliveries', policyActionId: 'read_provider_status',
  schema: schema('resend.email_deliveries', 'Email Delivery', 'view'),
  async run() {
    const db = adminDb()
    if (!db) return { ok: false, error: 'Supabase admin not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' }

    const countNotNull = async (col: string) => {
      const { count } = await db.from('email_delivery_status')
        .select('resend_email_id', { count: 'exact', head: true })
        .not(col, 'is', null)
      return count || 0
    }
    const [delivered, bounced, opened, complained] = await Promise.all([
      countNotNull('delivered_at'), countNotNull('bounced_at'),
      countNotNull('opened_at'), countNotNull('complained_at'),
    ])
    const { count: sentTotal } = await db.from('outreach_sends')
      .select('id', { count: 'exact', head: true }).eq('channel', 'email')

    const { data: sends } = await db.from('outreach_sends')
      .select('id, outreach_id, sent_at, metadata')
      .eq('channel', 'email')
      .order('sent_at', { ascending: false })
      .limit(50)
    const list: any[] = sends || []

    const ids = list.map(s => s?.metadata?.providerResult?.id).filter(Boolean)
    const statusById: Record<string, any> = {}
    if (ids.length) {
      const { data: st } = await db.from('email_delivery_status').select('*').in('resend_email_id', ids)
      for (const r of (st || [])) statusById[(r as any).resend_email_id] = r
    }
    const outreachIds = Array.from(new Set(list.map(s => s.outreach_id).filter(Boolean)))
    const nameById: Record<string, string> = {}
    if (outreachIds.length) {
      const { data: oq } = await db.from('outreach_queue').select('id, business_name').in('id', outreachIds)
      for (const r of (oq || [])) nameById[(r as any).id] = (r as any).business_name
    }

    const emails = list.map(s => {
      const rid = s?.metadata?.providerResult?.id || null
      const st = rid ? statusById[rid] : null
      return {
        sent_at: s.sent_at,
        to: s?.metadata?.toEmail || null,
        business: s.outreach_id ? (nameById[s.outreach_id] || null) : null,
        status: deriveStatus(st),
        opened: !!(st && st.opened_at),
        open_count: st?.open_count || 0,
        bounce_type: st?.bounce_type || null,
        resend_email_id: rid,
        confirmed: !!st, // false = dispatched but no delivery event captured yet
      }
    })

    const message = `${sentTotal || 0} sent · ${delivered} delivered · ${bounced} bounced · ${opened} opened${bounced ? '  ⚠ bounces' : ''}`
    return {
      ok: true,
      message,
      data: {
        summary: { sentTotal: sentTotal || 0, delivered, bounced, complained, opened, tracked: ids.length },
        count: emails.length,
        emails,
      },
    }
  },
})
