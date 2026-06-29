// saas/console-core/executors/resend.ts
// Full Resend CRUD executor — read (list domains/keys/audiences/broadcasts/emails)
// and write (add domain, re-verify, delete domain, create/delete API key,
// create/delete audience, add/delete contact, send test email).
// Every write flows through the same registerExecutor path as the reads.

import { registerExecutor } from '../defaultHost'
import type { ActionSchema } from '../types'
import { createClient } from '@supabase/supabase-js'

const API = 'https://api.resend.com'
function key(): string | null { return process.env.RESEND_API_KEY || null }

async function req(method: string, path: string, body?: unknown) {
  const k = key(); if (!k) return { ok: false as const, error: 'RESEND_API_KEY not set' }
  const opts: RequestInit = { method, headers: { Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' } }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch(`${API}${path}`, opts)
  const text = await res.text()
  if (!res.ok) return { ok: false as const, error: `Resend ${res.status}: ${text.slice(0, 300)}` }
  const json = text ? JSON.parse(text) : {}
  return { ok: true as const, json }
}
async function getJSON(path: string) { return req('GET', path) }

const schema = (id: string, label: string, verb: string, fields: any[] = []): ActionSchema => ({ id, label, verb, fields })
const rows = (j: any): any[] => Array.isArray(j) ? j : (j.data || [])

// ── READ ─────────────────────────────────────────────────────────────────────
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

// ── EMAIL DELIVERY (enriched from Resend + webhook table) ────────────────────
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
    if (firstError && collected.length === 0) return { ok: false, error: firstError }
    const db = adminDb()
    const statusById: Record<string, any> = {}
    if (db && collected.length) {
      const ids = collected.map((e: any) => e.id).filter(Boolean)
      for (let i = 0; i < ids.length; i += 100) {
        const { data: st } = await db.from('email_delivery_status').select('*').in('resend_email_id', ids.slice(i, i + 100))
        for (const r of (st || [])) statusById[(r as any).resend_email_id] = r
      }
    }
    const emails = collected.map((e: any) => {
      const st = statusById[e.id]
      const status = e.last_event || deriveFromWebhook(st) || 'sent'
      return { id: e.id, to: Array.isArray(e.to) ? e.to[0] : e.to, from: e.from, subject: e.subject, created_at: e.created_at, status, opened: !!(st && st.opened_at) || status === 'opened', open_count: st?.open_count || 0, bounce_type: st?.bounce_type || null }
    })
    const has = (s: string) => emails.filter((e: any) => (e.status || '').includes(s)).length
    const delivered = has('delivered'), bounced = has('bounced'), opened = emails.filter((e: any) => e.opened).length
    return { ok: true, message: `${emails.length} emails · ${delivered} delivered · ${bounced} bounced · ${opened} opened`, data: { source: 'resend:GET /emails', summary: { total: emails.length, delivered, bounced, opened }, count: emails.length, emails } }
  },
})

// ── WRITE: Domains ───────────────────────────────────────────────────────────
registerExecutor({
  providerId: 'resend', actionId: 'add_domain', policyActionId: 'crud_actions',
  schema: schema('resend.add_domain', 'Add Domain', 'create', [
    { id: 'name', label: 'Domain', type: 'text', required: true },
    { id: 'region', label: 'Region', type: 'text', required: true },
  ]),
  async run(_ctx, input) {
    const r = await req('POST', '/domains', { name: input.name, region: input.region || 'us-east-1' })
    if (!r.ok) return r
    return { ok: true, message: `Domain ${input.name} added — status: ${r.json.status || 'pending'}. Add the DNS records shown by Resend then click Re-verify.`, data: r.json }
  },
})
registerExecutor({
  providerId: 'resend', actionId: 'verify_domain', policyActionId: 'crud_actions',
  schema: schema('resend.verify_domain', 'Re-verify Domain', 'update', [{ id: 'domainId', label: 'Domain ID', type: 'text', required: true }]),
  async run(_ctx, input) {
    const r = await req('POST', `/domains/${input.domainId}/verify`)
    if (!r.ok) return r
    return { ok: true, message: `Verification triggered for domain ${input.domainId}. Refresh List Domains to see updated status.`, data: r.json }
  },
})
registerExecutor({
  providerId: 'resend', actionId: 'delete_domain', policyActionId: 'delete_provider_resource',
  schema: schema('resend.delete_domain', 'Delete Domain', 'delete', [{ id: 'domainId', label: 'Domain ID', type: 'text', required: true }]),
  async run(_ctx, input) {
    const r = await req('DELETE', `/domains/${input.domainId}`)
    if (!r.ok) return r
    return { ok: true, message: `Domain ${input.domainId} deleted.`, data: r.json }
  },
})

// ── WRITE: API Keys ───────────────────────────────────────────────────────────
registerExecutor({
  providerId: 'resend', actionId: 'create_api_key', policyActionId: 'crud_actions',
  schema: schema('resend.create_api_key', 'Create API Key', 'create', [
    { id: 'name', label: 'Key name', type: 'text', required: true },
    { id: 'permission', label: 'Permission', type: 'text', required: true },
  ]),
  async run(_ctx, input) {
    const r = await req('POST', '/api-keys', { name: input.name, permission: input.permission })
    if (!r.ok) return r
    return { ok: true, message: `API key "${input.name}" created. Save the token — it is shown only once.`, data: { id: r.json.id, name: r.json.name, token: r.json.token } }
  },
})
registerExecutor({
  providerId: 'resend', actionId: 'delete_api_key', policyActionId: 'rotate_secret_key',
  schema: schema('resend.delete_api_key', 'Delete API Key', 'delete', [{ id: 'keyId', label: 'Key ID', type: 'text', required: true }]),
  async run(_ctx, input) {
    const r = await req('DELETE', `/api-keys/${input.keyId}`)
    if (!r.ok) return r
    return { ok: true, message: `API key ${input.keyId} revoked.`, data: r.json }
  },
})

// ── WRITE: Audiences ──────────────────────────────────────────────────────────
registerExecutor({
  providerId: 'resend', actionId: 'create_audience', policyActionId: 'crud_actions',
  schema: schema('resend.create_audience', 'Create Audience', 'create', [{ id: 'name', label: 'Audience name', type: 'text', required: true }]),
  async run(_ctx, input) {
    const r = await req('POST', '/audiences', { name: input.name })
    if (!r.ok) return r
    return { ok: true, message: `Audience "${input.name}" created.`, data: r.json }
  },
})
registerExecutor({
  providerId: 'resend', actionId: 'delete_audience', policyActionId: 'delete_provider_resource',
  schema: schema('resend.delete_audience', 'Delete Audience', 'delete', [{ id: 'audienceId', label: 'Audience ID', type: 'text', required: true }]),
  async run(_ctx, input) {
    const r = await req('DELETE', `/audiences/${input.audienceId}`)
    if (!r.ok) return r
    return { ok: true, message: `Audience ${input.audienceId} deleted.`, data: r.json }
  },
})

// ── WRITE: Contacts ───────────────────────────────────────────────────────────
registerExecutor({
  providerId: 'resend', actionId: 'add_contact', policyActionId: 'crud_actions',
  schema: schema('resend.add_contact', 'Add Contact', 'create', [
    { id: 'audienceId', label: 'Audience ID', type: 'text', required: true },
    { id: 'email', label: 'Email', type: 'email', required: true },
    { id: 'first_name', label: 'First name', type: 'text' },
    { id: 'last_name', label: 'Last name', type: 'text' },
  ]),
  async run(_ctx, input) {
    const r = await req('POST', `/audiences/${input.audienceId}/contacts`, { email: input.email, first_name: input.first_name || '', last_name: input.last_name || '' })
    if (!r.ok) return r
    return { ok: true, message: `Contact ${input.email} added.`, data: r.json }
  },
})
registerExecutor({
  providerId: 'resend', actionId: 'delete_contact', policyActionId: 'crud_actions',
  schema: schema('resend.delete_contact', 'Delete Contact', 'delete', [
    { id: 'audienceId', label: 'Audience ID', type: 'text', required: true },
    { id: 'email', label: 'Contact email', type: 'email', required: true },
  ]),
  async run(_ctx, input) {
    const r = await req('DELETE', `/audiences/${input.audienceId}/contacts/${encodeURIComponent(String(input.email))}`)
    if (!r.ok) return r
    return { ok: true, message: `Contact ${input.email} removed.`, data: r.json }
  },
})

// ── WRITE: Send test email ─────────────────────────────────────────────────────
registerExecutor({
  providerId: 'resend', actionId: 'send_test_email', policyActionId: 'send_sendgrid_email',
  schema: schema('resend.send_test_email', 'Send Test Email', 'send', [
    { id: 'to', label: 'Recipient', type: 'email', required: true },
    { id: 'subject', label: 'Subject', type: 'text', required: true },
    { id: 'from_name', label: 'From name', type: 'text' },
  ]),
  async run(_ctx, input) {
    const fromName = String(input.from_name || 'SaaSSignal Sales')
    const r = await req('POST', '/emails', {
      from: `${fromName} <saassales@signalboostapp.com>`,
      to: [input.to],
      subject: input.subject,
      html: `<p>This is a test email from the SignalBoost Hub Console, sent from <strong>saassales@signalboostapp.com</strong> via Resend.</p><p>If you received this, the domain is verified and email delivery is working.</p>`,
    })
    if (!r.ok) return r
    return { ok: true, message: `Test email sent to ${input.to}. Check the inbox — if it arrives, the domain is verified and sending is live.`, data: r.json }
  },
})
