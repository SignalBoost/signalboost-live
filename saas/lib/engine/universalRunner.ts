import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type ProviderRegistryMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

type JsonObject = Record<string, unknown>

export type ProviderRegistryRow = {
  id: string
  provider_id: string
  action_id: string
  display_name?: string | null
  is_active: boolean
  method: ProviderRegistryMethod
  endpoint_template?: string | null
  /** Legacy/blueprint alias supported for imported tool_templates rows. */
  url_template?: string | null
  header_template?: JsonObject | null
  headers_template?: JsonObject | null
  payload_template?: unknown
  request_template?: unknown
  config_schema?: JsonObject | null
  credential_schema?: JsonObject | null
  auth_schema?: JsonObject | null
  output_paths?: Record<string, string> | null
  response_mapping?: { output_path?: string; output_paths?: Record<string, string> } | null
  timeout_ms?: number | null
}

export type SecretReference =
  | string
  | {
      ref?: string
      secretRef?: string
      name?: string
    }

export type UniversalRunnerInput = {
  providerId: string
  actionId: string
  variables?: Record<string, unknown>
  /** Optional credential package loaded by the caller's backend database interface. */
  credentials?: Record<string, unknown>
  /** Optional backend-only resolver for credential references such as vault://... or env://... . */
  resolveCredential?: (reference: SecretReference, context: { providerId: string; actionId: string }) => Promise<unknown>
  supabase?: SupabaseClient
  fetchImpl?: typeof fetch
}

export type UniversalRunnerResult = {
  /** Requirement-facing success flag. */
  success: boolean
  /** Backward-compatible alias used by existing callers/tests. */
  ok: boolean
  providerId: string
  actionId: string
  status: number
  outputs: Record<string, unknown>
  raw: unknown
  error?: string
  diagnostics?: {
    stage: 'load_registry' | 'hydrate_request' | 'execute_request' | 'parse_response' | 'map_response'
    providerRowId?: string
    endpoint?: string
  }
}

const TEMPLATE_TOKEN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g
const EXACT_TEMPLATE_TOKEN = /^\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}$/
const DEFAULT_TIMEOUT_MS = 30000

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { persistSession: false } })
}

function isPlainObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) return error.name === 'AbortError' ? 'Provider request timed out' : error.message
  if (typeof error === 'string') return error
  return 'Unknown universal runner error'
}

function failure(
  input: Pick<UniversalRunnerInput, 'providerId' | 'actionId'>,
  stage: UniversalRunnerResult['diagnostics']['stage'],
  error: unknown,
  extra: Partial<NonNullable<UniversalRunnerResult['diagnostics']>> = {},
): UniversalRunnerResult {
  return {
    success: false,
    ok: false,
    providerId: input.providerId,
    actionId: input.actionId,
    status: 0,
    outputs: {},
    raw: null,
    error: normalizeError(error),
    diagnostics: { stage, ...extra },
  }
}

/**
 * Dynamic JSON path reader for provider response mappings. Supports common
 * database-authored paths such as $, $.choices[0].message.content,
 * choices[0].message.content, content[0].text, and bracketed string keys.
 */
export function readJsonPath(source: unknown, path: string): unknown {
  if (!path || path === '$') return source
  const normalized = path.startsWith('$.') ? path.slice(2) : path.startsWith('$') ? path.slice(1) : path
  if (!normalized) return source

  const parts = Array.from(normalized.matchAll(/([^.[\]]+)|\[(?:(\d+)|["']([^"']+)["'])\]/g)).map(
    (match) => match[1] ?? match[2] ?? match[3],
  )

  return parts.reduce<unknown>((current, part) => {
    if (current == null) return undefined
    if (Array.isArray(current)) return current[Number(part)]
    if (typeof current === 'object') return (current as JsonObject)[part]
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
    const exact = template.match(EXACT_TEMPLATE_TOKEN)
    if (exact) return readJsonPath(variables, exact[1]) as T
    return template.replace(TEMPLATE_TOKEN, (_, path: string) => stringifyTemplateValue(readJsonPath(variables, path))) as T
  }

  if (Array.isArray(template)) return template.map((item) => hydrateTemplate(item, variables)) as T

  if (isPlainObject(template)) {
    return Object.fromEntries(Object.entries(template).map(([key, value]) => [key, hydrateTemplate(value, variables)])) as T
  }

  return template
}

async function resolveCredentialPackage(input: UniversalRunnerInput): Promise<Record<string, unknown>> {
  const provided = input.credentials ?? {}
  const resolver = input.resolveCredential
  if (!resolver) return provided

  const resolvedEntries = await Promise.all(
    Object.entries(provided).map(async ([key, value]) => {
      if (isPlainObject(value) && (typeof value.ref === 'string' || typeof value.secretRef === 'string' || typeof value.name === 'string')) {
        return [key, await resolver(value as SecretReference, { providerId: input.providerId, actionId: input.actionId })]
      }
      if (typeof value === 'string' && /^(vault|secret|env|credential):\/\//.test(value)) {
        return [key, await resolver(value, { providerId: input.providerId, actionId: input.actionId })]
      }
      return [key, value]
    }),
  )

  return Object.fromEntries(resolvedEntries)
}

function assertSafeEndpoint(endpoint: unknown) {
  if (typeof endpoint !== 'string' || !endpoint.trim()) throw new Error('Provider endpoint template resolved to an empty URL')
  const parsed = new URL(endpoint)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`Unsupported provider endpoint protocol: ${parsed.protocol}`)
  return parsed.toString()
}

function normalizeHeaders(headers: unknown): HeadersInit {
  if (!isPlainObject(headers)) return {}
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([, value]) => value != null && value !== '')
      .map(([key, value]) => [key, stringifyTemplateValue(value)]),
  )
}

function buildOutputs(row: ProviderRegistryRow, responsePayload: unknown) {
  const mappedPaths = row.response_mapping?.output_paths ?? row.output_paths ?? {}
  const outputs = Object.fromEntries(Object.entries(mappedPaths).map(([key, path]) => [key, readJsonPath(responsePayload, path)]))
  const singleOutputPath = row.response_mapping?.output_path
  return singleOutputPath ? { ...outputs, output: readJsonPath(responsePayload, singleOutputPath) } : outputs
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
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
  let row: ProviderRegistryRow

  try {
    row = await loadProviderRow(input)
  } catch (error) {
    return failure(input, 'load_registry', error)
  }

  const providerIdentity = { providerId: row.provider_id, actionId: row.action_id }
  let endpoint = ''

  try {
    const credentials = await resolveCredentialPackage(input)
    const variables = { ...(input.variables ?? {}), credentials }
    endpoint = assertSafeEndpoint(hydrateTemplate(row.endpoint_template ?? row.url_template ?? '', variables))
    const headers = normalizeHeaders(hydrateTemplate(row.header_template ?? row.headers_template ?? {}, variables))
    const payloadTemplate = row.request_template ?? row.payload_template ?? null
    const payload = hydrateTemplate(payloadTemplate, variables)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), Math.max(1, row.timeout_ms || DEFAULT_TIMEOUT_MS))

    try {
      const response = await (input.fetchImpl ?? fetch)(endpoint, {
        method: row.method,
        headers,
        body: row.method === 'GET' || row.method === 'DELETE' ? undefined : JSON.stringify(payload),
        signal: controller.signal,
      })

      let raw: unknown
      try {
        raw = await parseResponse(response)
      } catch (error) {
        return failure(providerIdentity, 'parse_response', error, { providerRowId: row.id, endpoint })
      }

      try {
        return {
          success: response.ok,
          ok: response.ok,
          providerId: row.provider_id,
          actionId: row.action_id,
          status: response.status,
          outputs: buildOutputs(row, raw),
          raw,
          ...(response.ok ? {} : { error: `Provider returned HTTP ${response.status}` }),
        }
      } catch (error) {
        return failure(providerIdentity, 'map_response', error, { providerRowId: row.id, endpoint })
      }
    } catch (error) {
      return failure(providerIdentity, 'execute_request', error, { providerRowId: row.id, endpoint })
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    return failure(providerIdentity, 'hydrate_request', error, { providerRowId: row.id, endpoint: endpoint || undefined })
  }
}
