// saas/lib/portable-browser/adapters/browserbase-adapter.ts
import type {
  BrowserSessionFactory,
  BrowserSessionLaunchRequest,
  BrowserSessionPort,
} from '../browser-task-contracts.ts'
import { sanitizeBrowserRuntimeError } from '../browser-error-sanitizer.ts'

const BROWSERBASE_ADAPTER_ID = 'browserbase'
const BROWSERBASE_API_URL = 'https://api.browserbase.com/v1/sessions'
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

// A hostname a resolver could actually answer for. IPv6 in brackets, or DNS labels.
//
// THIS EXISTS BECAUSE THE ACCEPTANCE HARNESS CAUGHT IT. `new URL('https://*.example.com')`
// parses cleanly and its `.origin` round-trips, so a wildcard entry passed every check above
// and landed in the allowlist. Matching is exact, so it never widened access — it did the
// opposite and quietly matched NOTHING, which is worse in the way that matters: a buyer who
// writes a wildcard believes a whole domain is covered, and no request is ever approved
// against it. Refusing the entry tells them at configuration time instead.
const RESOLVABLE_HOST = /^(\[[0-9a-fA-F:.]+\]|[a-zA-Z0-9_](?:[a-zA-Z0-9_-]*[a-zA-Z0-9_])?(?:\.[a-zA-Z0-9_](?:[a-zA-Z0-9_-]*[a-zA-Z0-9_])?)*)$/

export interface BrowserbaseCredentialBrokerPort {
  resolveBrowserbaseApiKey(scope: Readonly<{ projectId: string }>): Promise<string>
}

export interface BrowserbaseSessionTransport {
  createSession(request: Readonly<{ projectId: string; apiKey: string }>): Promise<Readonly<{ sessionId: string; connectUrl: string }>>
  connect(connectUrl: string): Promise<BrowserSessionPort>
}

export interface BrowserbaseAdapterConfiguration {
  projectId: string
  approvedOrigins: readonly string[]
  credentialBroker: BrowserbaseCredentialBrokerPort
  transport: BrowserbaseSessionTransport
}

export interface BrowserbaseAdapterFactory {
  create(configuration: BrowserbaseAdapterConfiguration): BrowserSessionFactory
}

export interface BrowserbaseFetchLike {
  (input: string, init: Readonly<{ method: 'POST'; headers: Readonly<Record<string, string>>; body: string }>): Promise<Readonly<{
    ok: boolean
    status: number
    json(): Promise<unknown>
  }>>
}

export interface BrowserbaseConnectionPort {
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
    throw new Error('browserbase_invalid_origin')
  }
  // An exact origin only: no path, query, fragment, or embedded credentials.
  if (parsed.origin !== value || !/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('browserbase_invalid_origin')
  }
  // Plaintext http is permitted ONLY for loopback, so a buyer can run locally without
  // weakening what a production origin has to be.
  if (!RESOLVABLE_HOST.test(parsed.hostname)) {
    throw new Error('browserbase_invalid_origin')
  }
  if (parsed.protocol === 'http:' && !LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error('browserbase_insecure_origin_rejected')
  }
  return parsed.origin
}

function assertApprovedRequest(request: BrowserSessionLaunchRequest, approvedOrigins: ReadonlySet<string>): void {
  if (request.adapterId !== BROWSERBASE_ADAPTER_ID || request.provider.toLowerCase() !== BROWSERBASE_ADAPTER_ID) {
    throw new Error('browserbase_launch_scope_rejected')
  }
  if (request.mode === 'execute_change') throw new Error('browserbase_execute_change_rejected')
  if (request.allowedOrigins.length === 0) throw new Error('browserbase_origin_required')
  for (const value of request.allowedOrigins) {
    const origin = normalizeApprovedOrigin(value)
    if (!approvedOrigins.has(origin)) throw new Error('browserbase_origin_rejected')
  }
}

export class BrowserbaseSessionFactory implements BrowserSessionFactory {
  private readonly projectId: string
  private readonly approvedOrigins: ReadonlySet<string>
  private readonly credentialBroker: BrowserbaseCredentialBrokerPort
  private readonly transport: BrowserbaseSessionTransport

  constructor(configuration: BrowserbaseAdapterConfiguration) {
    if (!configuration || typeof configuration !== 'object') throw new Error('browserbase_configuration_required')
    this.projectId = requireNonEmptyString(configuration.projectId, 'browserbase_project_id_required')
    if (!Array.isArray(configuration.approvedOrigins)) throw new Error('browserbase_origin_required')
    if (!configuration.credentialBroker || typeof configuration.credentialBroker.resolveBrowserbaseApiKey !== 'function') {
      throw new Error('browserbase_credential_broker_required')
    }
    if (!configuration.transport
      || typeof configuration.transport.createSession !== 'function'
      || typeof configuration.transport.connect !== 'function') {
      throw new Error('browserbase_transport_required')
    }

    this.approvedOrigins = new Set(configuration.approvedOrigins.map(normalizeApprovedOrigin))
    if (this.approvedOrigins.size === 0) throw new Error('browserbase_origin_required')
    this.credentialBroker = configuration.credentialBroker
    this.transport = configuration.transport
  }

  async open(request: BrowserSessionLaunchRequest): Promise<BrowserSessionPort> {
    assertApprovedRequest(request, this.approvedOrigins)
    let apiKey = ''
    try {
      apiKey = requireNonEmptyString(
        await this.credentialBroker.resolveBrowserbaseApiKey({ projectId: this.projectId }),
        'browserbase_credential_unavailable',
      )
      const session = await this.transport.createSession({ projectId: this.projectId, apiKey })
      const connectUrl = requireNonEmptyString(session?.connectUrl, 'browserbase_connect_url_missing')
      requireNonEmptyString(session?.sessionId, 'browserbase_session_id_missing')

      let parsedConnectUrl: URL
      try {
        parsedConnectUrl = new URL(connectUrl)
      } catch {
        throw new Error('browserbase_connect_url_invalid')
      }
      if (parsedConnectUrl.protocol !== 'wss:') throw new Error('browserbase_connect_url_invalid')
      return await this.transport.connect(connectUrl)
    } catch (error) {
      throw new Error(sanitizeBrowserRuntimeError(error, apiKey ? [apiKey] : []))
    }
  }
}

export class FetchBrowserbaseSessionTransport implements BrowserbaseSessionTransport {
  private readonly fetch: BrowserbaseFetchLike
  private readonly connection: BrowserbaseConnectionPort

  constructor(fetch: BrowserbaseFetchLike, connection: BrowserbaseConnectionPort) {
    if (typeof fetch !== 'function' || !connection || typeof connection.connect !== 'function') {
      throw new Error('browserbase_transport_required')
    }
    this.fetch = fetch
    this.connection = connection
  }

  async createSession(request: Readonly<{ projectId: string; apiKey: string }>): Promise<Readonly<{ sessionId: string; connectUrl: string }>> {
    const response = await this.fetch(BROWSERBASE_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bb-api-key': request.apiKey },
      body: JSON.stringify({ projectId: request.projectId }),
    })
    if (!response.ok) throw new Error(`browserbase_session_create_failed:${response.status}`)
    const payload = await response.json()
    if (!payload || typeof payload !== 'object') throw new Error('browserbase_session_response_invalid')
    const record = payload as { id?: unknown; connectUrl?: unknown }
    return {
      sessionId: requireNonEmptyString(record.id, 'browserbase_session_id_missing'),
      connectUrl: requireNonEmptyString(record.connectUrl, 'browserbase_connect_url_missing'),
    }
  }

  connect(connectUrl: string): Promise<BrowserSessionPort> {
    return this.connection.connect(connectUrl)
  }
}

export const browserbaseAdapterStatus = Object.freeze({
  status: 'available' as const,
  notImplemented: false,
  requiredPorts: Object.freeze(['credential_broker', 'browserbase_transport']),
  productionEnabled: false,
  // CORRECTED. This said 'sandbox_loopback_only', which stopped being true when the origin
  // posture changed to buyer-declared allowlists. A buyer reading the old value would have
  // concluded the adapter can only drive localhost — which would make the portable useless
  // to them — while the code has been accepting their production origins all along. Metadata
  // that outlives the behaviour it describes is the same defect as a hardcoded status field.
  executionBoundary: 'buyer_declared_origins' as const,
})

export const browserbaseAdapterFactory: BrowserbaseAdapterFactory = Object.freeze({
  create: configuration => new BrowserbaseSessionFactory(configuration),
})

export function validateBrowserbaseAdapterConfiguration(value: unknown): value is BrowserbaseAdapterConfiguration {
  if (!value || typeof value !== 'object') return false
  const configuration = value as Partial<BrowserbaseAdapterConfiguration>
  if (typeof configuration.projectId !== 'string'
    || !Array.isArray(configuration.approvedOrigins)
    || !configuration.credentialBroker
    || typeof configuration.credentialBroker.resolveBrowserbaseApiKey !== 'function'
    || !configuration.transport
    || typeof configuration.transport.createSession !== 'function'
    || typeof configuration.transport.connect !== 'function') {
    return false
  }

  try {
    return configuration.approvedOrigins.length > 0
      && configuration.approvedOrigins.every(origin => typeof origin === 'string' && normalizeApprovedOrigin(origin) === origin)
  } catch {
    return false
  }
}
