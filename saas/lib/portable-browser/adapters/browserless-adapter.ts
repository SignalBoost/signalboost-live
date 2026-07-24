import type {
  BrowserSessionFactory,
  BrowserSessionLaunchRequest,
  BrowserSessionPort,
} from '../../browser-runtime/contracts.ts'
import { sanitizeBrowserRuntimeError } from '../../browser-runtime/error-sanitizer.ts'

const BROWSERLESS_ADAPTER_ID = 'browserless'
const SANDBOX_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const SUPPORTED_PATHS = new Set(['/', '/chromium', '/chrome', '/chromium/playwright'])

export interface BrowserlessCredentialBrokerPort {
  resolveBrowserlessToken(scope: Readonly<{ endpointOrigin: string }>): Promise<string>
}

export interface BrowserlessConnectionPort {
  connect(connectUrl: string): Promise<BrowserSessionPort>
}

export interface BrowserlessAdapterConfiguration {
  endpoint: string
  approvedOrigins: readonly string[]
  credentialBroker: BrowserlessCredentialBrokerPort
  connection: BrowserlessConnectionPort
}

export interface BrowserlessAdapterFactory {
  create(configuration: BrowserlessAdapterConfiguration): BrowserSessionFactory
}

function requireNonEmptyString(value: unknown, errorCode: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(errorCode)
  return value
}

function normalizeSandboxOrigin(value: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('browserless_invalid_origin')
  }
  if (parsed.origin !== value || !/^https?:$/.test(parsed.protocol)) throw new Error('browserless_invalid_origin')
  if (!SANDBOX_HOSTS.has(parsed.hostname)) throw new Error('browserless_external_origin_rejected')
  return parsed.origin
}

function normalizeEndpoint(value: string): URL {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('browserless_endpoint_invalid')
  }
  if (parsed.protocol !== 'wss:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('browserless_endpoint_invalid')
  }
  if (!SUPPORTED_PATHS.has(parsed.pathname)) throw new Error('browserless_endpoint_path_rejected')
  return parsed
}

function assertApprovedRequest(request: BrowserSessionLaunchRequest, approvedOrigins: ReadonlySet<string>): void {
  if (request.adapterId !== BROWSERLESS_ADAPTER_ID || request.provider.toLowerCase() !== BROWSERLESS_ADAPTER_ID) {
    throw new Error('browserless_launch_scope_rejected')
  }
  if (request.mode === 'execute_change') throw new Error('browserless_execute_change_rejected')
  if (request.allowedOrigins.length === 0) throw new Error('browserless_origin_required')
  for (const value of request.allowedOrigins) {
    const origin = normalizeSandboxOrigin(value)
    if (!approvedOrigins.has(origin)) throw new Error('browserless_origin_rejected')
  }
}

function buildConnectUrl(endpoint: URL, token: string): string {
  const connectUrl = new URL(endpoint.toString())
  connectUrl.searchParams.set('token', token)
  return connectUrl.toString()
}

export class BrowserlessSessionFactory implements BrowserSessionFactory {
  private readonly endpoint: URL
  private readonly approvedOrigins: ReadonlySet<string>
  private readonly credentialBroker: BrowserlessCredentialBrokerPort
  private readonly connection: BrowserlessConnectionPort

  constructor(configuration: BrowserlessAdapterConfiguration) {
    if (!configuration || typeof configuration !== 'object') throw new Error('browserless_configuration_required')
    this.endpoint = normalizeEndpoint(requireNonEmptyString(configuration.endpoint, 'browserless_endpoint_required'))
    if (!Array.isArray(configuration.approvedOrigins)) throw new Error('browserless_origin_required')
    if (!configuration.credentialBroker || typeof configuration.credentialBroker.resolveBrowserlessToken !== 'function') {
      throw new Error('browserless_credential_broker_required')
    }
    if (!configuration.connection || typeof configuration.connection.connect !== 'function') {
      throw new Error('browserless_connection_required')
    }
    this.approvedOrigins = new Set(configuration.approvedOrigins.map(normalizeSandboxOrigin))
    if (this.approvedOrigins.size === 0) throw new Error('browserless_origin_required')
    this.credentialBroker = configuration.credentialBroker
    this.connection = configuration.connection
  }

  async open(request: BrowserSessionLaunchRequest): Promise<BrowserSessionPort> {
    assertApprovedRequest(request, this.approvedOrigins)
    let token = ''
    try {
      token = requireNonEmptyString(
        await this.credentialBroker.resolveBrowserlessToken({ endpointOrigin: this.endpoint.origin }),
        'browserless_credential_unavailable',
      )
      return await this.connection.connect(buildConnectUrl(this.endpoint, token))
    } catch (error) {
      throw new Error(sanitizeBrowserRuntimeError(error, token ? [token] : []))
    }
  }
}

export const browserlessAdapterStatus = Object.freeze({
  status: 'available' as const,
  notImplemented: false,
  requiredPorts: Object.freeze(['credential_broker', 'browserless_connection']),
  productionEnabled: false,
  executionBoundary: 'sandbox_loopback_only' as const,
})

export const browserlessAdapterFactory: BrowserlessAdapterFactory = Object.freeze({
  create: configuration => new BrowserlessSessionFactory(configuration),
})

export function validateBrowserlessAdapterConfiguration(value: unknown): value is BrowserlessAdapterConfiguration {
  if (!value || typeof value !== 'object') return false
  const configuration = value as Partial<BrowserlessAdapterConfiguration>
  if (typeof configuration.endpoint !== 'string'
    || !Array.isArray(configuration.approvedOrigins)
    || !configuration.credentialBroker
    || typeof configuration.credentialBroker.resolveBrowserlessToken !== 'function'
    || !configuration.connection
    || typeof configuration.connection.connect !== 'function') return false
  try {
    normalizeEndpoint(configuration.endpoint)
    return configuration.approvedOrigins.length > 0
      && configuration.approvedOrigins.every(origin => typeof origin === 'string' && normalizeSandboxOrigin(origin) === origin)
  } catch {
    return false
  }
}
