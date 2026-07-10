import { NextRequest, NextResponse } from 'next/server'

const IMPROVMX_API_BASE_URL = process.env.IMPROVMX_API_BASE_URL || 'https://api.improvmx.com/v3'

type ImprovMXDomain = {
  domain?: string
  name?: string
  status?: string
  active?: boolean
  is_active?: boolean
  aliases_count?: number
  alias_count?: number
  created?: string
  created_at?: string
}

type ImprovMXAlias = {
  alias?: string
  local_part?: string
  name?: string
  forward?: string
  destination?: string
  email?: string
  active?: boolean
  is_active?: boolean
  created?: string
  created_at?: string
}

type ImprovMXJson = Record<string, unknown> | unknown[]

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status })
}

function apiKey() {
  return process.env.IMPROVMX_API_KEY?.trim() || ''
}

function authHeader(key: string) {
  return `Basic ${Buffer.from(`api:${key}`).toString('base64')}`
}

function rows<T>(json: ImprovMXJson, key: string): T[] {
  if (Array.isArray(json)) return json as T[]
  const keyed = json[key]
  const data = json.data
  if (Array.isArray(keyed)) return keyed as T[]
  if (Array.isArray(data)) return data as T[]
  return []
}

function normalizeDomain(domain: ImprovMXDomain) {
  const name = domain.domain || domain.name || ''
  const status = String(domain.status || (domain.active || domain.is_active ? 'active' : 'pending')).toLowerCase()
  const active = domain.active ?? domain.is_active ?? status === 'active'

  return {
    domain: name,
    active,
    status,
    aliases_count: domain.aliases_count ?? domain.alias_count ?? null,
    created: domain.created || domain.created_at || null,
  }
}

function normalizeAlias(alias: ImprovMXAlias) {
  return {
    alias: alias.alias || alias.local_part || alias.name || '',
    forward: alias.forward || alias.destination || alias.email || '',
    active: alias.active ?? alias.is_active ?? true,
    created: alias.created || alias.created_at || null,
  }
}

function cleanDomain(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function cleanAlias(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/@.*$/, '')
}

async function improvmxRequest(method: string, path: string, body?: unknown) {
  const key = apiKey()
  if (!key) return { ok: false as const, status: 500, error: 'IMPROVMX_API_KEY is not configured' }

  const headers: Record<string, string> = {
    Authorization: authHeader(key),
    Accept: 'application/json',
  }

  const init: RequestInit = { method, headers, cache: 'no-store' }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }

  const response = await fetch(`${IMPROVMX_API_BASE_URL}${path}`, init)
  const text = await response.text()
  let json: ImprovMXJson = {}

  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = { raw: text }
  }

  if (!response.ok) {
    const payload = Array.isArray(json) ? {} : json
    const message = payload.error || payload.message || text || 'Unknown ImprovMX error'
    return { ok: false as const, status: response.status, error: `ImprovMX ${response.status}: ${String(message).slice(0, 400)}` }
  }

  return { ok: true as const, status: response.status, json }
}

export async function GET(request: NextRequest) {
  try {
    const domain = cleanDomain(request.nextUrl.searchParams.get('domain'))

    if (domain) {
      const result = await improvmxRequest('GET', `/domains/${encodeURIComponent(domain)}/aliases`)
      if (!result.ok) return jsonResponse({ ok: false, error: result.error, aliases: [] }, result.status)

      const aliases = rows<ImprovMXAlias>(result.json, 'aliases')
        .map(normalizeAlias)
        .filter(row => row.alias)

      return jsonResponse({ ok: true, domain, count: aliases.length, aliases })
    }

    const result = await improvmxRequest('GET', '/domains')
    if (!result.ok) return jsonResponse({ ok: false, error: result.error, domains: [] }, result.status)

    const domains = rows<ImprovMXDomain>(result.json, 'domains')
      .map(normalizeDomain)
      .filter(row => row.domain)

    return jsonResponse({ ok: true, count: domains.length, domains })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load ImprovMX data'
    return jsonResponse({ ok: false, error: message, domains: [], aliases: [] }, 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const domain = cleanDomain(body.domain)
    const alias = cleanAlias(body.alias)
    const forward = String(body.forward || '').trim().toLowerCase()

    if (!domain || !alias || !forward.includes('@')) {
      return jsonResponse({ ok: false, error: 'A valid domain, alias, and forwarding email are required' }, 400)
    }

    const result = await improvmxRequest('POST', `/domains/${encodeURIComponent(domain)}/aliases`, { alias, forward })
    if (!result.ok) return jsonResponse({ ok: false, error: result.error }, result.status)

    return jsonResponse({ ok: true, domain, alias, forward, data: result.json }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create ImprovMX alias'
    return jsonResponse({ ok: false, error: message }, 500)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const domain = cleanDomain(request.nextUrl.searchParams.get('domain'))
    const alias = cleanAlias(request.nextUrl.searchParams.get('alias'))

    if (!domain || !alias) return jsonResponse({ ok: false, error: 'A valid domain and alias are required' }, 400)

    const result = await improvmxRequest('DELETE', `/domains/${encodeURIComponent(domain)}/aliases/${encodeURIComponent(alias)}`)
    if (!result.ok) return jsonResponse({ ok: false, error: result.error }, result.status)

    return jsonResponse({ ok: true, domain, alias, data: result.json })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete ImprovMX alias'
    return jsonResponse({ ok: false, error: message }, 500)
  }
}
