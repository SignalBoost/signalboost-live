import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type ProviderRegistryMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type ProviderRegistryRow = {
  id: string
  provider_id: string
  action_id: string
  display_name?: string | null
  is_active: boolean
  method: ProviderRegistryMethod
  endpoint_template: string
  header_template: Record<string, unknown>
  payload_template: unknown
  config_schema: Record<string, unknown>
  output_paths: Record<string, string>
  timeout_ms: number
}

export type UniversalRunnerInput = {
  providerId: string
  actionId: string
  variables?: Record<string, unknown>
  supabase?: SupabaseClient
  fetchImpl?: typeof fetch
}

export type UniversalRunnerResult = {
  ok: boolean
  providerId: string
  actionId: string
  status: number
  outputs: Record<string, unknown>
  raw: unknown
}

const TEMPLATE_TOKEN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { persistSession: false } })
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function readJsonPath(source: unknown, path: string): unknown {
  if (!path || path === '$') return source
  const normalized = path.startsWith('$.') ? path.slice(2) : path.startsWith('$') ? path.slice(1) : path
  if (!normalized) return source

  const parts = normalized
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)

  return parts.reduce<unknown>((current, part) => {
    if (current == null) return undefined
    if (Array.isArray(current)) return current[Number(part)]
    if (typeof current === 'object') return (current as Record<string, unknown>)[part]
    return undefined
  }, source)
}

function stringifyTemplateValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

export function hydrateTemplate<T>(template: T, variables: Record<string, unknown>): T {
  if (typeof template === 'string') {
    const exact = template.match(/^\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}$/)
    if (exact) return readJsonPath(variables, exact[1]) as T
    return template.replace(TEMPLATE_TOKEN, (_, path: string) => stringifyTemplateValue(readJsonPath(variables, path))) as T
  }

  if (Array.isArray(template)) return template.map((item) => hydrateTemplate(item, variables)) as T

  if (isPlainObject(template)) {
    return Object.fromEntries(
      Object.entries(template).map(([key, value]) => [key, hydrateTemplate(value, variables)]),
    ) as T
  }

  return template
}

function assertSafeEndpoint(endpoint: string) {
  const parsed = new URL(endpoint)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Unsupported provider endpoint protocol: ${parsed.protocol}`)
  }
  return parsed.toString()
}

function buildOutputs(paths: Record<string, string>, responsePayload: unknown) {
  return Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, readJsonPath(responsePayload, path)]))
}

async function parseResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return response.json()
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function loadProviderRow(input: UniversalRunnerInput): Promise<ProviderRegistryRow> {
  const db = input.supabase ?? getDb()
  const { data, error } = await db
    .from('provider_registry')
    .select('*')
    .eq('provider_id', input.providerId)
    .eq('action_id', input.actionId)
    .eq('is_active', true)
    .single()

  if (error) throw error
  if (!data) throw new Error(`No active provider_registry row for ${input.providerId}/${input.actionId}`)
  return data as ProviderRegistryRow
}

export async function runUniversalProvider(input: UniversalRunnerInput): Promise<UniversalRunnerResult> {
  const row = await loadProviderRow(input)
  const variables = input.variables ?? {}
  const endpoint = assertSafeEndpoint(hydrateTemplate(row.endpoint_template, variables))
  const headers = hydrateTemplate(row.header_template ?? {}, variables) as Record<string, string>
  const payload = hydrateTemplate(row.payload_template ?? null, variables)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(1, row.timeout_ms || 30000))

  try {
    const response = await (input.fetchImpl ?? fetch)(endpoint, {
      method: row.method,
      headers,
      body: row.method === 'GET' || row.method === 'DELETE' ? undefined : JSON.stringify(payload),
      signal: controller.signal,
    })
    const raw = await parseResponse(response)
    return {
      ok: response.ok,
      providerId: row.provider_id,
      actionId: row.action_id,
      status: response.status,
      outputs: buildOutputs(row.output_paths ?? {}, raw),
      raw,
    }
  } finally {
    clearTimeout(timeout)
  }
}
