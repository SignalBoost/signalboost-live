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

// ── Email Delivery: a true mirror of the Resend "Emails" dashboard ───────────
// Primary source is Resend's own List Sent Emails endpoint (GET /emails), so the
// console shows exactly what Resend shows — no dependency on our own ledger. Each
// row is then enriched with open/bounce detail captured by the delivery webhook
// (email_delivery_status) when we have it.
function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !svc) return null
  return createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false } })
}
function deriveFromWebhook(st: any): string | null {
  if (!st) return null
  if (st.bounced_at) return 'bounced'
  if (st.complained_at) return 'complained'
  if (st.opened_at) return 'opened'
  if (st.delivered_at) return 'delivered'
  return st.last_event || null
}
registerExecutor({
  providerId: 'resend', actionId: 'email_deliveries', policyActionId: 'read_provider_status',
  schema: schema('resend.email_deliveries', 'Email Delivery', 'view'),
  async run() {
    // 1) Pull the real sent list from Resend, paginating up to ~100 most recent.
    const collected: any[] = []
    let after: string | undefined
    let firstError: string | null = null
    for (let page = 0; page < 5; page++) {
      const r = await getJSON(after ? `/emails?after=${encodeURIComponent(after)}` : '/emails')
      if (!r.ok) { firstError = r.error; break }
      const data = rows(r.json)
      collected.push(...data)
      const hasMore = !!(r.json && r.json.has_more) && data.length > 0
      after = data.length ? data[data.length - 1].id : undefined
      if (!hasMore || !after) break
    }
    if (firstError && collected.length === 0) {
      return { ok: false, error: `${firstError}. If this says the endpoint is unavailable, the Resend API key may lack access to List Sent Emails.` }
    }

    // 2) Enrich with delivery-webhook detail (open counts, bounce type) we hold.
    const db = adminDb()
    const statusById: Record<string, any> = {}
    if (db && collected.length) {
      const ids = collected.map(e => e.id).filter(Boolean)
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100)
        const { data: st } = await db.from('email_delivery_status').select('*').in('resend_email_id', chunk)
        for (const r of (st || [])) statusById[(r as any).resend_email_id] = r
      }
    }

    const emails = collected.map(e => {
      const st = statusById[e.id]
      const to = Array.isArray(e.to) ? e.to[0] : e.to
      const status = e.last_event || deriveFromWebhook(st) || 'sent'
      return {
        id: e.id,
        to: to || null,
        from: e.from || null,
        subject: e.subject || null,
        created_at: e.created_at || null,
        status,
        opened: !!(st && st.opened_at) || status === 'opened',
        open_count: st?.open_count || 0,
        bounce_type: st?.bounce_type || null,
      }
    })

    const has = (s: string) => emails.filter(e => (e.status || '').includes(s)).length
    const delivered = has('delivered'), bounced = has('bounced'), opened = emails.filter(e => e.opened).length
    const message = `${emails.length} email${emails.length === 1 ? '' : 's'} in Resend · ${delivered} delivered · ${bounced} bounced · ${opened} opened${bounced ? '  ⚠ bounces' : ''}`
    return {
      ok: true,
      message,
      data: {
        source: 'resend:GET /emails',
        summary: { total: emails.length, delivered, bounced, opened },
        count: emails.length,
        emails,
      },
    }
  },
})
