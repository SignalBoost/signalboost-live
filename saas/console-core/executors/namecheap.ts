// saas/console-core/executors/namecheap.ts
// Namecheap DNS executor — list/add/delete DNS host records and one-click
// Resend DNS setup. Uses Namecheap's XML API with API-user credentials from env.

import { registerExecutor } from '../defaultHost'
import type { ActionSchema } from '../types'

const API = 'https://api.namecheap.com/xml.response'

type NamecheapResult = { ok: true; xml: string } | { ok: false; error: string }
type HostListResult = { ok: true; records: DnsHost[] } | { ok: false; error: string }

type DnsHost = {
  HostId?: string
  Name: string
  Type: string
  Address: string
  MXPref?: string
  TTL?: string
}

function env(name: string): string | null {
  const value = process.env[name]
  return value && value.trim() ? value.trim() : null
}

function credentials() {
  const apiUser = env('NAMECHEAP_API_USER')
  const apiKey = env('NAMECHEAP_API_KEY')
  const username = env('NAMECHEAP_USERNAME') || apiUser
  const clientIp = env('NAMECHEAP_CLIENT_IP')
  const sandbox = (process.env.NAMECHEAP_SANDBOX || '').toLowerCase() === 'true'
  if (!apiUser || !apiKey || !username || !clientIp) {
    return { ok: false as const, error: 'NAMECHEAP_API_USER, NAMECHEAP_API_KEY, NAMECHEAP_USERNAME, and NAMECHEAP_CLIENT_IP must be set' }
  }
  return { ok: true as const, apiUser, apiKey, username, clientIp, baseUrl: sandbox ? 'https://api.sandbox.namecheap.com/xml.response' : API }
}

function schema(id: string, label: string, verb: string, fields: any[] = []): ActionSchema {
  return { id, label, verb, fields }
}

function value(input: Record<string, unknown>, key: string): string {
  const v = input[key]
  return v === undefined || v === null ? '' : String(v).trim()
}

function splitDomain(domain: string): { sld: string; tld: string } {
  const clean = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '').toLowerCase()
  const parts = clean.split('.').filter(Boolean)
  if (parts.length < 2) throw new Error('Domain must include a TLD, e.g. example.com')
  return { sld: parts.slice(0, -1).join('.'), tld: parts[parts.length - 1] }
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function decodeXml(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
}

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`))
  return match ? decodeXml(match[1]) : undefined
}

function parseHosts(xml: string): DnsHost[] {
  const hosts: DnsHost[] = []
  for (const match of xml.matchAll(/<host\b[^>]*\/>/gi)) {
    const tag = match[0]
    hosts.push({
      HostId: attr(tag, 'HostId'),
      Name: attr(tag, 'Name') || '@',
      Type: attr(tag, 'Type') || 'TXT',
      Address: attr(tag, 'Address') || '',
      MXPref: attr(tag, 'MXPref'),
      TTL: attr(tag, 'TTL'),
    })
  }
  return hosts
}

async function call(command: string, domain: string, params: Record<string, string> = {}): Promise<NamecheapResult> {
  const creds = credentials()
  if (!creds.ok) return { ok: false, error: creds.error }
  let parsed: { sld: string; tld: string }
  try { parsed = splitDomain(domain) } catch (error: any) { return { ok: false, error: error.message || String(error) } }

  const search = new URLSearchParams({
    ApiUser: creds.apiUser,
    ApiKey: creds.apiKey,
    UserName: creds.username,
    ClientIp: creds.clientIp,
    Command: command,
    SLD: parsed.sld,
    TLD: parsed.tld,
    ...params,
  })

  const res = await fetch(`${creds.baseUrl}?${search.toString()}`)
  const xml = await res.text()
  if (!res.ok) return { ok: false, error: `Namecheap ${res.status}: ${xml.slice(0, 300)}` }
  if (/Status="ERROR"/i.test(xml)) {
    const errors = [...xml.matchAll(/<Error[^>]*>([\s\S]*?)<\/Error>/gi)].map(m => decodeXml(m[1].replace(/<[^>]+>/g, '').trim()))
    return { ok: false, error: errors.join('; ') || 'Namecheap API returned an error' }
  }
  return { ok: true, xml }
}

async function listHosts(domain: string): Promise<HostListResult> {
  const r = await call('namecheap.domains.dns.getHosts', domain)
  if (r.ok === false) return { ok: false, error: r.error }
  const records = parseHosts(r.xml)
  return { ok: true as const, records }
}

async function setHosts(domain: string, records: DnsHost[]): Promise<NamecheapResult> {
  const params: Record<string, string> = {}
  records.forEach((record, index) => {
    const n = index + 1
    params[`HostName${n}`] = record.Name || '@'
    params[`RecordType${n}`] = record.Type.toUpperCase()
    params[`Address${n}`] = record.Address
    if (record.MXPref) params[`MXPref${n}`] = record.MXPref
    params[`TTL${n}`] = record.TTL || '1800'
  })
  return call('namecheap.domains.dns.setHosts', domain, params)
}

function normalizedRecord(input: Record<string, unknown>): DnsHost {
  return {
    Name: value(input, 'host') || '@',
    Type: (value(input, 'type') || 'TXT').toUpperCase(),
    Address: value(input, 'value'),
    MXPref: value(input, 'mxPref') || undefined,
    TTL: value(input, 'ttl') || '1800',
  }
}

const commonFields = [
  { id: 'domain', label: 'Domain', type: 'text', required: true, placeholder: 'example.com' },
]

registerExecutor({
  providerId: 'namecheap', actionId: 'list_dns_records', policyActionId: 'read_provider_status',
  schema: schema('namecheap.list_dns_records', 'List DNS Records', 'view', commonFields),
  async run(_ctx, input) {
    const domain = value(input, 'domain')
    const r = await listHosts(domain); if (r.ok === false) return r
    return { ok: true, message: `${r.records.length} DNS record${r.records.length === 1 ? '' : 's'}`, data: { count: r.records.length, records: r.records } }
  },
})

registerExecutor({
  providerId: 'namecheap', actionId: 'add_dns_record', policyActionId: 'crud_actions',
  schema: schema('namecheap.add_dns_record', 'Add DNS Record', 'create', [
    ...commonFields,
    { id: 'type', label: 'Type', type: 'select', required: true, options: ['A', 'AAAA', 'CNAME', 'MX', 'TXT'].map(v => ({ value: v, label: v })) },
    { id: 'host', label: 'Host', type: 'text', required: true, placeholder: '@' },
    { id: 'value', label: 'Value', type: 'text', required: true },
    { id: 'ttl', label: 'TTL', type: 'number', placeholder: '1800' },
    { id: 'mxPref', label: 'MX preference', type: 'number' },
  ]),
  async run(_ctx, input) {
    const domain = value(input, 'domain')
    const existing = await listHosts(domain); if (existing.ok === false) return existing
    const next = [...existing.records, normalizedRecord(input)]
    const r = await setHosts(domain, next); if (r.ok === false) return r
    return { ok: true, message: `Added ${value(input, 'type').toUpperCase()} record for ${value(input, 'host') || '@'}`, data: { count: next.length, records: next } }
  },
})

registerExecutor({
  providerId: 'namecheap', actionId: 'delete_dns_record', policyActionId: 'delete_provider_resource',
  schema: schema('namecheap.delete_dns_record', 'Delete DNS Record', 'delete', [
    ...commonFields,
    { id: 'hostId', label: 'Host ID', type: 'text', required: true },
  ]),
  async run(_ctx, input) {
    const domain = value(input, 'domain')
    const hostId = value(input, 'hostId')
    const existing = await listHosts(domain); if (existing.ok === false) return existing
    const next = existing.records.filter(record => record.HostId !== hostId)
    if (next.length === existing.records.length) return { ok: false, error: `No DNS record found with Host ID ${hostId}` }
    const r = await setHosts(domain, next); if (r.ok === false) return r
    return { ok: true, message: `Deleted DNS record ${hostId}`, data: { count: next.length, records: next } }
  },
})

registerExecutor({
  providerId: 'namecheap', actionId: 'setup_resend_dns', policyActionId: 'crud_actions',
  schema: schema('namecheap.setup_resend_dns', 'Set Up Resend DNS', 'create', [
    ...commonFields,
    { id: 'records', label: 'Resend DNS records JSON', type: 'textarea', required: true },
  ]),
  async run(_ctx, input) {
    const domain = value(input, 'domain')
    let records: any[]
    try {
      const parsed = JSON.parse(value(input, 'records'))
      records = Array.isArray(parsed) ? parsed : (parsed.records || parsed.dns_records || [])
    } catch {
      return { ok: false, error: 'records must be valid JSON from Resend domain DNS records' }
    }
    const additions = records.map((record: any) => ({
      Name: String(record.name || record.host || '@').replace(new RegExp(`\\.?${domain.replace(/\./g, '\\.')}$`), '') || '@',
      Type: String(record.type || 'TXT').toUpperCase(),
      Address: String(record.value || record.record || record.address || ''),
      MXPref: record.priority ? String(record.priority) : undefined,
      TTL: '1800',
    })).filter(record => record.Address)
    if (!additions.length) return { ok: false, error: 'No Resend DNS records found in records JSON' }
    const existing = await listHosts(domain); if (existing.ok === false) return existing
    const next = [...existing.records, ...additions]
    const r = await setHosts(domain, next); if (r.ok === false) return r
    return { ok: true, message: `Added ${additions.length} Resend DNS record${additions.length === 1 ? '' : 's'} to ${domain}`, data: { added: additions, count: next.length, records: next } }
  },
})
