// saas/lib/portable-browser/adapters/steel-adapter.ts
import type {
  BrowserSessionFactory,
  BrowserSessionLaunchRequest,
  BrowserSessionPort,
} from '../browser-task-contracts.ts'
import { sanitizeBrowserRuntimeError } from '../browser-error-sanitizer.ts'

const STEEL_ADAPTER_ID = 'steel'
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export interface SteelCredentialBrokerPort {
  resolveSteelApiKey(scope: Readonly<{ apiOrigin: string }>): Promise<string>
}

export interface SteelSessionTransport {
  createSession(request: Readonly<{ apiBaseUrl: string; apiKey: string }>): Promise<Readonly<{
    sessionId: string
    websocketUrl: string
  }>>
  connect(connectUrl: string): Promise<BrowserSessionPort>
}

export interface SteelAdapterConfiguration {
  apiBaseUrl: string
  connectOrigin: string
  approvedOrigins: readonly string[]
  credentialBroker: SteelCredentialBrokerPort
  transport: SteelSessionTransport
}

export interface SteelAdapterFactory {
  create(configuration: SteelAdapterConfiguration): BrowserSessionFactory
}

export interface SteelFetchLike {
  (input: string, init: Readonly<{
    method: 'POST'
    headers: Readonly<Record<string, string>>
    body: string
  }>): Promise<Readonly<{
    ok: boolean
    status: number
    json(): Promise<unknown>
  }>>
}

export interface SteelConnectionPort {
  connect(connectUrl: string): Promise<BrowserSessionPort>
}

function requireNonEmptyString(value: unknown, errorCode: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(errorCode)
  return value
}

// ORIGIN POLICY. The buyer declares the origins this session may visit and NOTHING else is
// reachable. The allowlist must be non-empty, each entry must be an exact origin, and every
// origin on a launch request must already be in it. Plaintext http is confined to loopback.
// This adapter is meant to drive a buyer's real application, so the allowlist is the cage —
// not an artificial restriction to localhost.
function normalizeApprovedOrigin(value: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('steel_invalid_origin')
  }
  // An exact origin only: no path, query, fragment, or embedded credentials.
  if (parsed.origin !== value || !/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('steel_invalid_origin')
  }
  // Plaintext http is permitted ONLY for loopback, so a buyer can run locally without
  // weakening what a production origin has to be.
  if (parsed.protocol === 'http:' && !LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error('steel_insecure_origin_rejected')
  }
  return parsed.origin
}

function normalizeApiBaseUrl(value: string): URL {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('steel_api_base_url_invalid')
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('steel_api_base_url_invalid')
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') throw new Error('steel_api_base_url_invalid')
  return parsed
}

function normalizeConnectOrigin(value: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('steel_connect_origin_invalid')
  }
  if (parsed.protocol !== 'wss:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('steel_connect_origin_invalid')
  }
  return parsed.origin
}

function assertApprovedRequest(request: BrowserSessionLaunchRequest, approvedOrigins: ReadonlySet<string>): void {
  if (request.adapterId !== STEEL_ADAPTER_ID || request.provider.toLowerCase() !== STEEL_ADAPTER_ID) {
    throw new Error('steel_launch_scope_rejected')
  }
  if (request.mode === 'execute_change') throw new Error('steel_execute_change_rejected')
  if (request.allowedOrigins.length === 0) throw new Error('steel_origin_required')
  for (const value of request.allowedOrigins) {
    const origin = normalizeApprovedOrigin(value)
    if (!approvedOrigins.has(origin)) throw new Error('steel_origin_rejected')
  }
}

function buildConnectUrl(value: string, expectedOrigin: string, apiKey: string, sessionId: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('steel_websocket_url_invalid')
  }
  if (parsed.protocol !== 'wss:' || parsed.origin !== expectedOrigin || parsed.username || parsed.password || parsed.hash) {
    throw new Error('steel_websocket_url_invalid')
  }
  if (parsed.searchParams.has('apiKey')) throw new Error('steel_websocket_url_contains_credential')
  const returnedSessionId = parsed.searchParams.get('sessionId')
  if (returnedSessionId && returnedSessionId !== sessionId) throw new Error('steel_session_id_mismatch')
  parsed.searchParams.set('sessionId', sessionId)
  parsed.searchParams.set('apiKey', apiKey)
  return parsed.toString()
}

export class SteelSessionFactory implements BrowserSessionFactory {
  private readonly apiBaseUrl: URL
  private readonly connectOrigin: string
  private readonly approvedOrigins: ReadonlySet<string>
  private readonly credentialBroker: SteelCredentialBrokerPort
  private readonly transport: SteelSessionTransport

  constructor(configuration: SteelAdapterConfiguration) {
    if (!configuration || typeof configuration !== 'object') throw new Error('steel_configuration_required')
    this.apiBaseUrl = normalizeApiBaseUrl(requireNonEmptyString(configuration.apiBaseUrl, 'steel_api_base_url_required'))
    this.connectOrigin = normalizeConnectOrigin(requireNonEmptyString(configuration.connectOrigin, 'steel_connect_origin_required'))
    if (!Array.isArray(configuration.approvedOrigins)) throw new Error('steel_origin_required')
    if (!configuration.credentialBroker || typeof configuration.credentialBroker.resolveSteelApiKey !== 'function') {
      throw new Error('steel_credential_broker_required')
    }
    if (!configuration.transport
      || typeof configuration.transport.createSession !== 'function'
      || typeof configuration.transport.connect !== 'function') {
      throw new Error('steel_transport_required')
    }
    this.approvedOrigins = new Set(configuration.approvedOrigins.map(normalizeApprovedOrigin))
    if (this.approvedOrigins.size === 0) throw new Error('steel_origin_required')
    this.credentialBroker = configuration.credentialBroker
    this.transport = configuration.transport
  }

  async open(request: BrowserSessionLaunchRequest): Promise<BrowserSessionPort> {
    assertApprovedRequest(request, this.approvedOrigins)
    let apiKey = ''
    try {
      apiKey = requireNonEmptyString(
        await this.credentialBroker.resolveSteelApiKey({ apiOrigin: this.apiBaseUrl.origin }),
        'steel_credential_unavailable',
      )
      const session = await this.transport.createSession({ apiBaseUrl: this.apiBaseUrl.origin, apiKey })
      const sessionId = requireNonEmptyString(session?.sessionId, 'steel_session_id_missing')
      const websocketUrl = requireNonEmptyString(session?.websocketUrl, 'steel_websocket_url_missing')
      return await this.transport.connect(buildConnectUrl(websocketUrl, this.connectOrigin, apiKey, sessionId))
    } catch (error) {
      throw new Error(sanitizeBrowserRuntimeError(error, apiKey ? [apiKey] : []))
    }
  }
}

export class FetchSteelSessionTransport implements SteelSessionTransport {
  private readonly fetch: SteelFetchLike
  private readonly connection: SteelConnectionPort

  constructor(fetch: SteelFetchLike, connection: SteelConnectionPort) {
    if (typeof fetch !== 'function' || !connection || typeof connection.connect !== 'function') {
      throw new Error('steel_transport_required')
    }
    this.fetch = fetch
    this.connection = connection
  }

  async createSession(request: Readonly<{ apiBaseUrl: string; apiKey: string }>): Promise<Readonly<{
    sessionId: string
    websocketUrl: string
  }>> {
    const response = await this.fetch(`${request.apiBaseUrl}/v1/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'steel-api-key': request.apiKey },
      body: '{}',
    })
    if (!response.ok) throw new Error(`steel_session_create_failed:${response.status}`)
    const payload = await response.json()
    if (!payload || typeof payload !== 'object') throw new Error('steel_session_response_invalid')
    const record = payload as { id?: unknown; websocketUrl?: unknown; websocket_url?: unknown }
    return {
      sessionId: requireNonEmptyString(record.id, 'steel_session_id_missing'),
      websocketUrl: requireNonEmptyString(record.websocketUrl ?? record.websocket_url, 'steel_websocket_url_missing'),
    }
  }

  connect(connectUrl: string): Promise<BrowserSessionPort> {
    return this.connection.connect(connectUrl)
  }
}

export const steelAdapterStatus = Object.freeze({
  status: 'available' as const,
  notImplemented: false,
  requiredPorts: Object.freeze(['credential_broker', 'steel_transport']),
  productionEnabled: false,
  // CORRECTED. This said 'sandbox_loopback_only', which stopped being true when the origin
  // posture changed to buyer-declared allowlists. A buyer reading the old value would have
  // concluded the adapter can only drive localhost — which would make the portable useless
  // to them — while the code has been accepting their production origins all along. Metadata
  // that outlives the behaviour it describes is the same defect as a hardcoded status field.
  executionBoundary: 'buyer_declared_origins' as const,
})

export const steelAdapterFactory: SteelAdapterFactory = Object.freeze({
  create: configuration => new SteelSessionFactory(configuration),
})

export function validateSteelAdapterConfiguration(value: unknown): value is SteelAdapterConfiguration {
  if (!value || typeof value !== 'object') return false
  const configuration = value as Partial<SteelAdapterConfiguration>
  if (typeof configuration.apiBaseUrl !== 'string'
    || typeof configuration.connectOrigin !== 'string'
    || !Array.isArray(configuration.approvedOrigins)
    || !configuration.credentialBroker
    || typeof configuration.credentialBroker.resolveSteelApiKey !== 'function'
    || !configuration.transport
    || typeof configuration.transport.createSession !== 'function'
    || typeof configuration.transport.connect !== 'function') return false
  try {
    normalizeApiBaseUrl(configuration.apiBaseUrl)
    normalizeConnectOrigin(configuration.connectOrigin)
    return configuration.approvedOrigins.length > 0
      && configuration.approvedOrigins.every(origin => typeof origin === 'string' && normalizeApprovedOrigin(origin) === origin)
  } catch {
    return false
  }
}
