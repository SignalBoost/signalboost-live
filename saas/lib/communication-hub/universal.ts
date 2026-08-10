import type { CommunicationAdapter, CommunicationCapability, CommunicationContext, CommunicationResult } from './contracts'

const now = () => new Date().toISOString()

type UniversalEmailOperation = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  bodyMode?: 'json' | 'form' | 'none'
  responsePath?: string
}

type UniversalEmailConfig = {
  baseUrl: string
  headers?: Record<string, string>
  operations: Partial<Record<CommunicationCapability, UniversalEmailOperation>>
}

function deepGet(value: any, path?: string) {
  if (!path) return value
  return path.split('.').filter(Boolean).reduce((current, key) => current?.[key], value)
}

function config(context: CommunicationContext): UniversalEmailConfig {
  const raw = String(context.secrets?.COMMUNICATION_UNIVERSAL_CONFIG_JSON || context.metadata?.universalConfigJson || '')
  if (!raw) throw new Error('UNIVERSAL_EMAIL_CONFIG_REQUIRED')
  let parsed: UniversalEmailConfig
  try { parsed = JSON.parse(raw) } catch { throw new Error('UNIVERSAL_EMAIL_CONFIG_INVALID_JSON') }
  if (!parsed?.baseUrl || !parsed.operations || typeof parsed.operations !== 'object') throw new Error('UNIVERSAL_EMAIL_CONFIG_INVALID')
  const url = new URL(parsed.baseUrl)
  if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') throw new Error('UNIVERSAL_EMAIL_HTTPS_REQUIRED')
  return parsed
}

function substitute(template: string, input: Record<string, unknown>) {
  return template.replace(/\{([^}]+)\}/g, (_match, key) => {
    const value = deepGet(input, String(key))
    if (value === undefined || value === null) throw new Error(`UNIVERSAL_EMAIL_INPUT_REQUIRED:${key}`)
    return encodeURIComponent(String(value))
  })
}

function formEncode(input: Record<string, unknown>) {
  const form = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue
    form.append(key, typeof value === 'string' ? value : JSON.stringify(value))
  }
  return form.toString()
}

function headers(context: CommunicationContext, cfg: UniversalEmailConfig, bodyMode: UniversalEmailOperation['bodyMode']) {
  const out: Record<string, string> = { Accept: 'application/json' }
  for (const [name, template] of Object.entries(cfg.headers || {})) {
    out[name] = template.replace(/\{secret:([^}]+)\}/g, (_match, key) => {
      const value = context.secrets?.[String(key)]
      if (!value) throw new Error(`UNIVERSAL_EMAIL_SECRET_MISSING:${key}`)
      return value
    })
  }
  if (bodyMode === 'json') out['Content-Type'] = 'application/json'
  if (bodyMode === 'form') out['Content-Type'] = 'application/x-www-form-urlencoded'
  return out
}

export class UniversalEmailAdapter implements CommunicationAdapter {
  readonly providerId = 'universal-email-adapter'
  readonly displayName = 'Universal Email Adapter'
  readonly capabilities = ['email_send','email_draft','email_reply','email_forward','email_search','email_read','email_watch_replies'] as const satisfies readonly CommunicationCapability[]

  async execute<TOutput>(capability: CommunicationCapability, input: Record<string, unknown>, context: CommunicationContext): Promise<CommunicationResult<TOutput>> {
    try {
      const cfg = config(context)
      const operation = cfg.operations[capability]
      if (!operation) return { ok: false, errorCode: 'UNIVERSAL_EMAIL_CAPABILITY_UNMAPPED', retrievedAt: now() }
      const path = substitute(operation.path, input)
      const bodyMode = operation.bodyMode || (operation.method === 'GET' || operation.method === 'DELETE' ? 'none' : 'json')
      const base = cfg.baseUrl.replace(/\/$/, '')
      const body = bodyMode === 'json' ? JSON.stringify(input) : bodyMode === 'form' ? formEncode(input) : undefined
      const response = await fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, {
        method: operation.method,
        headers: headers(context, cfg, bodyMode),
        body,
        cache: 'no-store',
      })
      const responseBody = await response.json().catch(async () => ({ text: await response.text().catch(() => '') }))
      if (!response.ok) return { ok: false, errorCode: `UNIVERSAL_EMAIL_HTTP_${response.status}`, retrievedAt: now() }
      return { ok: true, data: deepGet(responseBody, operation.responsePath) as TOutput, mode: 'universal_email_executed', retrievedAt: now() }
    } catch (error) {
      return { ok: false, errorCode: error instanceof Error ? error.message : 'UNIVERSAL_EMAIL_EXECUTION_FAILED', retrievedAt: now() }
    }
  }
}
