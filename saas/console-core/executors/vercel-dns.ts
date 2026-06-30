// saas/console-core/executors/vercel-dns.ts
// Vercel DNS record management + a built-in propagation checker, so DNS work
// for any domain (including signalboostapp.com) never has to leave the hub.
// Uses the existing Vercel project/token resolver — same credentials as the
// other Vercel actions.

import { registerExecutor } from '../defaultHost'
import type { ActionSchema } from '../types'
import { resolveVercelProject } from '@/lib/hub/vercel-project'

const VERCEL_API = 'https://api.vercel.com'

function teamUrl(path: string, teamId?: string): string {
  const base = `${VERCEL_API}${path}`
  if (!teamId) return base
  const sep = path.includes('?') ? '&' : '?'
  return `${base}${sep}teamId=${encodeURIComponent(teamId)}`
}

async function vReq(method: string, path: string, token: string, teamId?: string, body?: unknown) {
  const opts: RequestInit = { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch(teamUrl(path, teamId), opts)
  const text = await res.text()
  if (!res.ok) return { ok: false as const, error: `Vercel ${res.status}: ${text.slice(0, 300)}` }
  return { ok: true as const, json: text ? JSON.parse(text) : {} }
}

const schema = (id: string, label: string, verb: string, fields: any[] = []): ActionSchema => ({ id, label, verb, fields })

// ── LIST DNS RECORDS ─────────────────────────────────────────────────────────
registerExecutor({
  providerId: 'vercel', actionId: 'list_dns_records', policyActionId: 'read_provider_status',
  schema: schema('vercel.list_dns_records', 'List DNS Records', 'view', [
    { id: 'domain', label: 'Domain', type: 'text', required: true, placeholder: 'signalboostapp.com' },
  ]),
  async run(_ctx, input) {
    const creds = await resolveVercelProject()
    if (!creds.ok || !creds.token) return { ok: false, error: creds.error || 'Vercel not configured' }
    const r = await vReq('GET', `/v4/domains/${encodeURIComponent(String(input.domain))}/records`, creds.token, creds.teamId)
    if (!r.ok) return r
    const records = (r.json.records || []).map((rec: any) => ({
      id: rec.id, type: rec.type, name: rec.name, value: rec.value, ttl: rec.ttl, priority: rec.priority || null, mxPriority: rec.mxPriority || null,
    }))
    return { ok: true, message: `${records.length} DNS record(s) for ${input.domain}`, data: { domain: input.domain, count: records.length, records } }
  },
})

// ── ADD DNS RECORD ────────────────────────────────────────────────────────────
registerExecutor({
  providerId: 'vercel', actionId: 'add_dns_record', policyActionId: 'crud_actions',
  schema: schema('vercel.add_dns_record', 'Add DNS Record', 'create', [
    { id: 'domain', label: 'Domain', type: 'text', required: true, placeholder: 'signalboostapp.com' },
    { id: 'type', label: 'Type', type: 'select', required: true, options: [
      { value: 'A', label: 'A' }, { value: 'AAAA', label: 'AAAA' },
      { value: 'CNAME', label: 'CNAME' }, { value: 'MX', label: 'MX' },
      { value: 'TXT', label: 'TXT' }, { value: 'NS', label: 'NS' },
    ]},
    { id: 'name', label: 'Name (subdomain, or blank for root)', type: 'text' },
    { id: 'value', label: 'Value', type: 'text', required: true },
    { id: 'ttl', label: 'TTL (seconds)', type: 'text' },
    { id: 'mxPriority', label: 'MX Priority (MX only)', type: 'text' },
  ]),
  async run(_ctx, input) {
    const creds = await resolveVercelProject()
    if (!creds.ok || !creds.token) return { ok: false, error: creds.error || 'Vercel not configured' }
    const body: any = { type: input.type, name: input.name || '', value: input.value, ttl: input.ttl ? Number(input.ttl) : 60 }
    if (input.type === 'MX' && input.mxPriority) body.mxPriority = Number(input.mxPriority)
    const r = await vReq('POST', `/v2/domains/${encodeURIComponent(String(input.domain))}/records`, creds.token, creds.teamId, body)
    if (!r.ok) return r
    return { ok: true, message: `DNS record added to ${input.domain}.`, data: { domain: input.domain, type: input.type, name: input.name, value: input.value, recordId: r.json.uid } }
  },
})

// ── EDIT DNS RECORD ───────────────────────────────────────────────────────────
registerExecutor({
  providerId: 'vercel', actionId: 'edit_dns_record', policyActionId: 'crud_actions',
  schema: schema('vercel.edit_dns_record', 'Edit DNS Record', 'update', [
    { id: 'recordId', label: 'Record ID (from List DNS Records)', type: 'text', required: true },
    { id: 'value', label: 'New value', type: 'text', required: true },
  ]),
  async run(_ctx, input) {
    const creds = await resolveVercelProject()
    if (!creds.ok || !creds.token) return { ok: false, error: creds.error || 'Vercel not configured' }
    const r = await vReq('PATCH', `/v1/domains/records/${encodeURIComponent(String(input.recordId))}`, creds.token, creds.teamId, { value: input.value })
    if (!r.ok) return r
    return { ok: true, message: `Record ${input.recordId} updated.`, data: r.json }
  },
})

// ── DELETE DNS RECORD ─────────────────────────────────────────────────────────
registerExecutor({
  providerId: 'vercel', actionId: 'delete_dns_record', policyActionId: 'delete_provider_resource',
  schema: schema('vercel.delete_dns_record', 'Delete DNS Record', 'delete', [
    { id: 'domain', label: 'Domain', type: 'text', required: true },
    { id: 'recordId', label: 'Record ID (from List DNS Records)', type: 'text', required: true },
  ]),
  async run(_ctx, input) {
    const creds = await resolveVercelProject()
    if (!creds.ok || !creds.token) return { ok: false, error: creds.error || 'Vercel not configured' }
    const r = await vReq('DELETE', `/v2/domains/${encodeURIComponent(String(input.domain))}/records/${encodeURIComponent(String(input.recordId))}`, creds.token, creds.teamId)
    if (!r.ok) return r
    return { ok: true, message: `Record ${input.recordId} deleted from ${input.domain}.`, data: { domain: input.domain, deleted: input.recordId } }
  },
})

// ── CHECK DNS PROPAGATION (replaces dnschecker.org) ──────────────────────────
// Queries multiple public DNS-over-HTTPS resolvers worldwide-ish and compares
// results, so propagation can be confirmed without leaving the hub.
const RESOLVERS: Array<{ name: string; url: (host: string, type: string) => string }> = [
  { name: 'Google',     url: (h, t) => `https://dns.google/resolve?name=${encodeURIComponent(h)}&type=${t}` },
  { name: 'Cloudflare', url: (h, t) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(h)}&type=${t}` },
]

async function queryResolver(resolver: typeof RESOLVERS[number], host: string, type: string) {
  try {
    const res = await fetch(resolver.url(host, type), { headers: { Accept: 'application/dns-json' } })
    if (!res.ok) return { resolver: resolver.name, ok: false, answers: [] as string[] }
    const j: any = await res.json()
    const answers = (j.Answer || []).map((a: any) => String(a.data))
    return { resolver: resolver.name, ok: answers.length > 0, answers }
  } catch {
    return { resolver: resolver.name, ok: false, answers: [] as string[] }
  }
}

registerExecutor({
  providerId: 'vercel', actionId: 'check_dns_propagation', policyActionId: 'read_provider_status',
  schema: schema('vercel.check_dns_propagation', 'Check DNS Propagation', 'view', [
    { id: 'hostname', label: 'Hostname', type: 'text', required: true, placeholder: 'resend._domainkey.signalboostapp.com' },
    { id: 'type', label: 'Record type', type: 'select', required: true, options: [
      { value: 'TXT', label: 'TXT' }, { value: 'MX', label: 'MX' }, { value: 'A', label: 'A' },
      { value: 'AAAA', label: 'AAAA' }, { value: 'CNAME', label: 'CNAME' }, { value: 'NS', label: 'NS' },
    ]},
    { id: 'expectedValue', label: 'Expected value (optional — to confirm a match)', type: 'text' },
  ]),
  async run(_ctx, input) {
    const host = String(input.hostname).trim()
    const type = String(input.type).trim().toUpperCase()
    const results = await Promise.all(RESOLVERS.map((r) => queryResolver(r, host, type)))
    const expected = input.expectedValue ? String(input.expectedValue).trim() : null
    const annotated = results.map((r) => ({
      ...r,
      matchesExpected: expected ? r.answers.some((a) => a.replace(/^"|"$/g, '').includes(expected)) : null,
    }))
    const allResolved = annotated.every((r) => r.ok)
    const allMatch = expected ? annotated.every((r) => r.matchesExpected) : null
    return {
      ok: true,
      message: expected
        ? (allMatch ? `✅ ${host} (${type}) resolves to the expected value on all checked resolvers.` : `⚠️ ${host} (${type}) does not yet match the expected value everywhere.`)
        : (allResolved ? `✅ ${host} (${type}) is resolving on all checked resolvers.` : `⚠️ ${host} (${type}) is not yet resolving everywhere.`),
      data: { hostname: host, type, expectedValue: expected, allResolved, allMatch, resolvers: annotated },
    }
  },
})
