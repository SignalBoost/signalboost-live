// saas/console-core/executors/resend.ts
import { registerExecutor } from '../defaultHost'
import type { ActionSchema } from '../types'

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
