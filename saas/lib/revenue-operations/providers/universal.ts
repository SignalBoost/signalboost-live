import type {
  RevenueProviderAdapter,
  RevenueProviderCapability,
  RevenueProviderContext,
  RevenueProviderHealth,
  RevenueProviderResult,
} from '../contracts'
import { resolveRevenueSecrets } from '../secretResolver'

function now() { return new Date().toISOString() }

type UniversalOperation = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  bodyMode?: 'json' | 'form' | 'none'
  responsePath?: string
}

type UniversalConfig = {
  baseUrl: string
  headers?: Record<string, string>
  operations: Partial<Record<RevenueProviderCapability, UniversalOperation>>
}

function deepGet(value: any, path?: string) {
  if (!path) return value
  return path.split('.').filter(Boolean).reduce((current, key) => current?.[key], value)
}

function substitute(template: string, input: Record<string, unknown>) {
  return template.replace(/\{([^}]+)\}/g, (_match, key) => {
    const value = deepGet(input, String(key))
    if (value === undefined || value === null) throw new Error(`UNIVERSAL_ADAPTER_INPUT_REQUIRED:${key}`)
    return encodeURIComponent(String(value))
  })
}

function formEncode(input: Record<string, unknown>): string {
  const form = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue
    form.append(key, typeof value === 'string' ? value : JSON.stringify(value))
  }
  return form.toString()
}

export class UniversalRevenueAdapter implements RevenueProviderAdapter {
  readonly providerId = 'universal-revenue-adapter'
  readonly displayName = 'Universal Revenue Adapter'
  readonly domain = 'universal' as const
  readonly capabilities = [
    'customer_lookup','customer_upsert','quote_create','invoice_create','invoice_lookup','invoice_status','payment_status','payment_record',
    'subscription_create','subscription_lookup','subscription_update','renewal_lookup','tax_estimate','document_send','document_status',
  ] as const satisfies readonly RevenueProviderCapability[]

  private config(context: RevenueProviderContext): UniversalConfig {
    const secrets = resolveRevenueSecrets(context)
    const raw = secrets.REVENUE_UNIVERSAL_CONFIG_JSON
    if (!raw) throw new Error('UNIVERSAL_ADAPTER_CONNECTION_INCOMPLETE')
    let parsed: UniversalConfig
    try { parsed = JSON.parse(raw) } catch { throw new Error('UNIVERSAL_ADAPTER_CONFIG_INVALID_JSON') }
    if (!parsed?.baseUrl || !parsed.operations || typeof parsed.operations !== 'object') {
      throw new Error('UNIVERSAL_ADAPTER_CONFIG_INVALID')
    }
    const url = new URL(parsed.baseUrl)
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('UNIVERSAL_ADAPTER_BASE_URL_INVALID')
    if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') throw new Error('UNIVERSAL_ADAPTER_HTTPS_REQUIRED')
    return parsed
  }

  private headers(context: RevenueProviderContext, config: UniversalConfig, bodyMode: UniversalOperation['bodyMode']) {
    const secrets = resolveRevenueSecrets(context)
    const out: Record<string, string> = { Accept: 'application/json' }
    for (const [name, template] of Object.entries(config.headers || {})) {
      out[name] = template.replace(/\{secret:([^}]+)\}/g, (_match, name) => {
        const value = secrets[String(name)]
        if (!value) throw new Error(`UNIVERSAL_ADAPTER_SECRET_MISSING:${name}`)
        return value
      })
    }
    if (bodyMode === 'json') out['Content-Type'] = 'application/json'
    if (bodyMode === 'form') out['Content-Type'] = 'application/x-www-form-urlencoded'
    return out
  }

  async testConnection(context: RevenueProviderContext): Promise<RevenueProviderHealth> {
    try {
      const config = this.config(context)
      const healthOperation = config.operations.customer_lookup || Object.values(config.operations)[0]
      if (!healthOperation) return { state: 'unconfigured', checkedAt: now(), messageKey: 'UNIVERSAL_ADAPTER_NO_OPERATIONS' }
      return { state: 'healthy', checkedAt: now() }
    } catch (error) {
      return { state: 'unconfigured', checkedAt: now(), messageKey: error instanceof Error ? error.message : 'UNIVERSAL_ADAPTER_INVALID' }
    }
  }

  async execute<TInput, TOutput>(capability: RevenueProviderCapability, input: TInput, context: RevenueProviderContext): Promise<RevenueProviderResult<TOutput>> {
    try {
      const config = this.config(context)
      const operation = config.operations[capability]
      if (!operation) return { ok: false, errorCode: 'UNIVERSAL_ADAPTER_CAPABILITY_UNMAPPED', retrievedAt: now() }
      const payload = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
      const path = substitute(operation.path, payload)
      const base = config.baseUrl.endsWith('/') ? config.baseUrl.slice(0, -1) : config.baseUrl
      const bodyMode = operation.bodyMode || (operation.method === 'GET' || operation.method === 'DELETE' ? 'none' : 'json')
      const body = bodyMode === 'json' ? JSON.stringify(payload) : bodyMode === 'form' ? formEncode(payload) : undefined
      const response = await fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, {
        method: operation.method,
        headers: this.headers(context, config, bodyMode),
        body,
        cache: 'no-store',
      })
      const responseBody = await response.json().catch(async () => ({ text: await response.text().catch(() => '') }))
      if (!response.ok) return { ok: false, errorCode: `UNIVERSAL_ADAPTER_HTTP_${response.status}`, retrievedAt: now() }
      const data = deepGet(responseBody, operation.responsePath)
      return { ok: true, data: data as TOutput, retrievedAt: now() }
    } catch (error) {
      return { ok: false, errorCode: error instanceof Error ? error.message : 'UNIVERSAL_ADAPTER_EXECUTION_FAILED', retrievedAt: now() }
    }
  }
}
