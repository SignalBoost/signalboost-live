import type {
  ProspectProviderAdapter,
  ProspectProviderCapability,
  ProspectProviderContext,
  ProspectProviderHealth,
  ProspectProviderResult,
} from './contracts.ts'
import { registerProspectProviderAdapters, resolveProspectSecrets } from './provider-runtime.ts'

type AuthMode = 'bearer' | 'header' | 'dnb_oauth'
type ProviderDefinition = {
  providerId: string
  displayName: string
  capabilities: readonly ProspectProviderCapability[]
  baseUrl: string
  baseUrlEnv?: string
  auth: AuthMode
  tokenEnv?: string
  apiKeyHeader?: string
  operationEnvPrefix?: string
  operations: Partial<Record<ProspectProviderCapability, { method: 'GET' | 'POST'; path: string }>>
}

function env(name: string | undefined) {
  if (!name) return undefined
  const value = process.env[name]
  return value && value.trim() ? value.trim() : undefined
}

function baseUrl(definition: ProviderDefinition) {
  return (env(definition.baseUrlEnv) || definition.baseUrl).replace(/\/$/, '')
}

function operation(definition: ProviderDefinition, capability: ProspectProviderCapability) {
  const envKey = definition.operationEnvPrefix ? `${definition.operationEnvPrefix}_${capability.toUpperCase()}_PATH` : ''
  const override = env(envKey)
  const configured = definition.operations[capability]
  if (override) return { method: configured?.method || 'POST', path: override }
  return configured
}

function absolute(base: string, path: string) {
  if (/^https:\/\//i.test(path)) return path
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`
}

function providerInput(input: unknown) {
  return input && typeof input === 'object' ? input as Record<string, unknown> : {}
}

async function dnbToken(secrets: Record<string, string>) {
  const key = secrets.DNB_CONSUMER_KEY || env('DNB_CONSUMER_KEY')
  const secret = secrets.DNB_CONSUMER_SECRET || env('DNB_CONSUMER_SECRET')
  if (!key || !secret) throw new Error('DNB_CREDENTIALS_REQUIRED')
  const encoded = Buffer.from(`${key}:${secret}`).toString('base64')
  const response = await fetch('https://plus.dnb.com/v1/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${encoded}`, 'Content-Type': 'application/json', Origin: 'www.dnb.com' },
    body: JSON.stringify({ grant_type: 'client_credentials' }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data?.access_token) throw new Error(data?.error?.message || 'DNB_AUTHENTICATION_FAILED')
  return String(data.access_token)
}

async function authHeaders(definition: ProviderDefinition, context: ProspectProviderContext) {
  const secrets = await resolveProspectSecrets(context)
  if (definition.auth === 'dnb_oauth') {
    return { Authorization: `Bearer ${await dnbToken(secrets)}`, 'Content-Type': 'application/json', Origin: 'www.dnb.com' }
  }
  const token = (definition.tokenEnv && (secrets[definition.tokenEnv] || env(definition.tokenEnv))) || ''
  if (!token) throw new Error(`${definition.providerId.toUpperCase().replace(/-/g, '_')}_CREDENTIAL_REQUIRED`)
  if (definition.auth === 'header') return { [definition.apiKeyHeader || 'X-Api-Key']: token, 'Content-Type': 'application/json' }
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

function crunchbaseBody(input: Record<string, unknown>) {
  if (Array.isArray(input.query) && Array.isArray(input.field_ids)) return input
  const name = String(input.name || input.company || input.keyword || '').trim()
  const query = name ? [{ type: 'predicate', field_id: 'identifier', operator_id: 'contains', values: [name] }] : []
  return {
    field_ids: ['identifier', 'website_url', 'categories', 'location_identifiers', 'short_description', 'num_employees_enum', 'rank_org_company'],
    query,
    limit: Math.max(1, Math.min(1000, Number(input.limit) || 25)),
  }
}

function cognismBody(input: Record<string, unknown>) {
  return input.filters && typeof input.filters === 'object' ? input.filters : input
}

function dnbBody(input: Record<string, unknown>) {
  if (typeof input.query === 'string') return { query: input.query, offset: Number(input.offset) || 0, size: Number(input.size) || 25 }
  const name = String(input.name || input.company || input.keyword || '').trim().replace(/:/g, ' ')
  return { query: `q=name:${name}`, offset: 0, size: Math.max(1, Math.min(100, Number(input.limit) || 25)) }
}

class HttpProspectAdapter implements ProspectProviderAdapter {
  readonly providerId: string
  readonly displayName: string
  readonly capabilities: readonly ProspectProviderCapability[]
  constructor(private readonly definition: ProviderDefinition) {
    this.providerId = definition.providerId
    this.displayName = definition.displayName
    this.capabilities = definition.capabilities
  }

  async testConnection(context: ProspectProviderContext): Promise<ProspectProviderHealth> {
    try {
      await authHeaders(this.definition, context)
      return { state: 'healthy', checkedAt: new Date().toISOString() }
    } catch (error) {
      return { state: 'authentication_failed', checkedAt: new Date().toISOString(), messageKey: error instanceof Error ? error.message : 'PROSPECT_PROVIDER_AUTHENTICATION_FAILED' }
    }
  }

  async execute<TInput, TOutput>(capability: ProspectProviderCapability, rawInput: TInput, context: ProspectProviderContext): Promise<ProspectProviderResult<TOutput>> {
    const op = operation(this.definition, capability)
    if (!op) return { ok: false, errorCode: 'PROSPECT_PROVIDER_CAPABILITY_NOT_CONFIGURED', provenance: [] }
    const retrievedAt = new Date().toISOString()
    try {
      const headers = await authHeaders(this.definition, context)
      const input = providerInput(rawInput)
      let body: Record<string, unknown> = input
      if (this.providerId === 'crunchbase') body = crunchbaseBody(input)
      if (this.providerId === 'cognism') body = cognismBody(input)
      if (this.providerId === 'dnb-direct-plus') body = dnbBody(input)
      const url = absolute(baseUrl(this.definition), op.path)
      const init: RequestInit = { method: op.method, headers }
      if (op.method !== 'GET') init.body = JSON.stringify(body)
      const response = await fetch(url, init)
      const data = await response.json().catch(() => ({}))
      const remaining = Number(response.headers.get('x-ratelimit-remaining'))
      const limit = Number(response.headers.get('x-ratelimit-limit'))
      const quota = Number.isFinite(remaining) || Number.isFinite(limit)
        ? { remaining: Number.isFinite(remaining) ? remaining : undefined, limit: Number.isFinite(limit) ? limit : undefined, unit: 'request' as const }
        : undefined
      if (!response.ok) {
        return { ok: false, errorCode: `PROSPECT_PROVIDER_HTTP_${response.status}`, provenance: [{ providerId: this.providerId, retrievedAt, sourceUrl: url }], quota }
      }
      return { ok: true, data: data as TOutput, provenance: [{ providerId: this.providerId, retrievedAt, sourceUrl: url }], quota }
    } catch (error) {
      return { ok: false, errorCode: error instanceof Error ? error.message : 'PROSPECT_PROVIDER_EXECUTION_FAILED', provenance: [{ providerId: this.providerId, retrievedAt }] }
    }
  }
}

const definitions: ProviderDefinition[] = [
  {
    providerId: 'cognism', displayName: 'Cognism', baseUrl: 'https://app.cognism.com', auth: 'bearer', tokenEnv: 'COGNISM_API_TOKEN', operationEnvPrefix: 'COGNISM',
    capabilities: ['company_search', 'company_profile', 'contact_search'],
    operations: {
      company_search: { method: 'POST', path: '/api/search/account/search' },
      company_profile: { method: 'POST', path: '/api/search/account/enrich' },
      contact_search: { method: 'POST', path: '/api/search/contact/search' },
    },
  },
  {
    providerId: 'crunchbase', displayName: 'Crunchbase', baseUrl: 'https://api.crunchbase.com', auth: 'header', tokenEnv: 'CRUNCHBASE_API_KEY', apiKeyHeader: 'X-cb-user-key', operationEnvPrefix: 'CRUNCHBASE',
    capabilities: ['company_search', 'company_profile'],
    operations: { company_search: { method: 'POST', path: '/v4/data/searches/organizations' }, company_profile: { method: 'POST', path: '/v4/data/searches/organizations' } },
  },
  {
    providerId: 'dnb-direct-plus', displayName: 'D&B Direct+', baseUrl: 'https://plus.dnb.com', auth: 'dnb_oauth', operationEnvPrefix: 'DNB',
    capabilities: ['company_search', 'company_profile', 'company_registry'],
    operations: { company_search: { method: 'POST', path: '/v1/dataexchange/organization-search' }, company_profile: { method: 'POST', path: '/v1/dataexchange/organization-search' }, company_registry: { method: 'POST', path: '/v1/dataexchange/organization-search' } },
  },
  {
    providerId: 'zoominfo', displayName: 'ZoomInfo', baseUrl: 'https://api.zoominfo.com', baseUrlEnv: 'ZOOMINFO_API_BASE_URL', auth: 'bearer', tokenEnv: 'ZOOMINFO_API_TOKEN', operationEnvPrefix: 'ZOOMINFO',
    capabilities: ['company_search', 'company_profile', 'contact_search'], operations: {},
  },
  {
    providerId: 'orbis', displayName: 'Orbis / Moody’s', baseUrl: 'https://api.bvdinfo.com', baseUrlEnv: 'ORBIS_API_BASE_URL', auth: 'bearer', tokenEnv: 'ORBIS_API_TOKEN', operationEnvPrefix: 'ORBIS',
    capabilities: ['company_search', 'company_profile', 'company_registry'], operations: {},
  },
]

export const productionProspectProviderAdapters = definitions.map(definition => new HttpProspectAdapter(definition))
registerProspectProviderAdapters(productionProspectProviderAdapters)
