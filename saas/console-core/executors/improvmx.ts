// saas/console-core/executors/improvmx.ts
// Live ImprovMX provider integration for domains and forwarding aliases.

import { registerExecutor } from '../defaultHost'
import type { ActionSchema } from '../types'

const API = process.env.IMPROVMX_API_BASE_URL || 'https://api.improvmx.com/v3'

function apiKey(): string | null {
  return process.env.IMPROVMX_API_KEY?.trim() || null
}

function authHeader(key: string): string {
  return `Basic ${Buffer.from(`api:${key}`).toString('base64')}`
}

async function req(method: string, path: string, body?: unknown) {
  const key = apiKey()
  if (!key) return { ok: false as const, error: 'IMPROVMX_API_KEY is not configured' }

  const headers: Record<string, string> = {
    Authorization: authHeader(key),
    Accept: 'application/json',
  }

  const options: RequestInit = { method, headers, cache: 'no-store' }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  }

  const response = await fetch(`${API}${path}`, options)
  const text = await response.text()
  let json: any = {}
  try { json = text ? JSON.parse(text) : {} } catch { json = { raw: text } }

  if (!response.ok) {
    const message = json?.error || json?.message || json?.errors?.[0]?.message || text || 'Unknown ImprovMX error'
    return { ok: false as const, error: `ImprovMX ${response.status}: ${String(message).slice(0, 400)}` }
  }

  return { ok: true as const, json }
}

const schema = (id: string, label: string, verb: string, fields: any[] = []): ActionSchema => ({ id, label, verb, fields })
const rows = (json: any, key: string): any[] => {
  if (Array.isArray(json)) return json
  if (Array.isArray(json?.[key])) return json[key]
  if (Array.isArray(json?.data)) return json.data
  return []
}

registerExecutor({
  providerId: 'improvmx', actionId: 'list_domains', policyActionId: 'read_provider_status',
  schema: schema('improvmx.list_domains', 'List Domains', 'view'),
  async run() {
    const result = await req('GET', '/domains')
    if (!result.ok) return result
    const domains = rows(result.json, 'domains').map((domain: any) => ({
      domain: domain.domain || domain.name,
      active: domain.active ?? domain.is_active ?? domain.status === 'active',
      status: domain.status || (domain.active ? 'active' : 'pending'),
      aliases_count: domain.aliases_count ?? domain.alias_count ?? null,
      created: domain.created || domain.created_at || null,
    }))
    return { ok: true, message: `${domains.length} ImprovMX domain${domains.length === 1 ? '' : 's'}`, data: { count: domains.length, domains } }
  },
})

registerExecutor({
  providerId: 'improvmx', actionId: 'get_domain', policyActionId: 'read_provider_status',
  schema: schema('improvmx.get_domain', 'Domain Status', 'view', [
    { id: 'domain', label: 'Domain', type: 'text', required: true, placeholder: 'signalboostapp.com' },
  ]),
  async run(_ctx, input) {
    const domain = encodeURIComponent(String(input.domain || '').trim().toLowerCase())
    const result = await req('GET', `/domains/${domain}`)
    if (!result.ok) return result
    const data = result.json?.domain || result.json
    return { ok: true, message: `${input.domain} — ${data.status || (data.active ? 'active' : 'pending')}`, data }
  },
})

registerExecutor({
  providerId: 'improvmx', actionId: 'list_aliases', policyActionId: 'read_provider_status',
  schema: schema('improvmx.list_aliases', 'List Aliases', 'view', [
    { id: 'domain', label: 'Domain', type: 'text', required: true, placeholder: 'signalboostapp.com' },
  ]),
  async run(_ctx, input) {
    const domain = encodeURIComponent(String(input.domain || '').trim().toLowerCase())
    const result = await req('GET', `/domains/${domain}/aliases`)
    if (!result.ok) return result
    const aliases = rows(result.json, 'aliases').map((alias: any) => ({
      alias: alias.alias || alias.local_part || alias.name,
      forward: alias.forward || alias.destination || alias.email,
      active: alias.active ?? alias.is_active ?? true,
      created: alias.created || alias.created_at || null,
    }))
    return { ok: true, message: `${aliases.length} forwarding alias${aliases.length === 1 ? '' : 'es'} for ${input.domain}`, data: { domain: input.domain, count: aliases.length, aliases } }
  },
})

registerExecutor({
  providerId: 'improvmx', actionId: 'create_alias', policyActionId: 'crud_actions',
  schema: schema('improvmx.create_alias', 'Create Alias', 'create', [
    { id: 'domain', label: 'Domain', type: 'text', required: true, placeholder: 'signalboostapp.com' },
    { id: 'alias', label: 'Alias', type: 'text', required: true, placeholder: 'saaspartners' },
    { id: 'forward', label: 'Forward to', type: 'email', required: true, placeholder: 'owner@example.com' },
  ]),
  async run(_ctx, input) {
    const domain = encodeURIComponent(String(input.domain || '').trim().toLowerCase())
    const alias = String(input.alias || '').trim().toLowerCase().replace(/@.*$/, '')
    const forward = String(input.forward || '').trim().toLowerCase()
    if (!alias || !forward.includes('@')) return { ok: false, error: 'A valid alias and forwarding email are required' }
    const result = await req('POST', `/domains/${domain}/aliases`, { alias, forward })
    if (!result.ok) return result
    return { ok: true, message: `${alias}@${input.domain} now forwards to ${forward}`, data: result.json }
  },
})

registerExecutor({
  providerId: 'improvmx', actionId: 'update_alias', policyActionId: 'crud_actions',
  schema: schema('improvmx.update_alias', 'Update Alias', 'update', [
    { id: 'domain', label: 'Domain', type: 'text', required: true, placeholder: 'signalboostapp.com' },
    { id: 'alias', label: 'Alias', type: 'text', required: true, placeholder: 'saaspartners' },
    { id: 'forward', label: 'New forwarding email', type: 'email', required: true },
  ]),
  async run(_ctx, input) {
    const domain = encodeURIComponent(String(input.domain || '').trim().toLowerCase())
    const alias = encodeURIComponent(String(input.alias || '').trim().toLowerCase().replace(/@.*$/, ''))
    const forward = String(input.forward || '').trim().toLowerCase()
    if (!forward.includes('@')) return { ok: false, error: 'A valid forwarding email is required' }
    const result = await req('PUT', `/domains/${domain}/aliases/${alias}`, { forward })
    if (!result.ok) return result
    return { ok: true, message: `${input.alias}@${input.domain} now forwards to ${forward}`, data: result.json }
  },
})

registerExecutor({
  providerId: 'improvmx', actionId: 'delete_alias', policyActionId: 'delete_provider_resource',
  schema: schema('improvmx.delete_alias', 'Delete Alias', 'delete', [
    { id: 'domain', label: 'Domain', type: 'text', required: true, placeholder: 'signalboostapp.com' },
    { id: 'alias', label: 'Alias', type: 'text', required: true, placeholder: 'saaspartners' },
  ]),
  async run(_ctx, input) {
    const domain = encodeURIComponent(String(input.domain || '').trim().toLowerCase())
    const alias = encodeURIComponent(String(input.alias || '').trim().toLowerCase().replace(/@.*$/, ''))
    const result = await req('DELETE', `/domains/${domain}/aliases/${alias}`)
    if (!result.ok) return result
    return { ok: true, message: `${input.alias}@${input.domain} deleted`, data: result.json }
  },
})
