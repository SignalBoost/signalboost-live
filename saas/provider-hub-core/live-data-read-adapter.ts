import { createProviderLiveDataReadEvidence } from './live-data-read-evidence.ts'
import type { ProviderLiveDataReadEvidence } from './live-data-read-evidence.ts'

export type ProviderLiveDataExecutionMode = 'test' | 'staging' | 'production'

export interface ProviderLiveDataReadRequest {
  readonly tenantId: string
  readonly environmentId: string
  readonly connectionId: string
  readonly providerId: string
  readonly capability: string
  readonly sourceUrl: string
  readonly observedAt: string
  readonly timeoutMs: number
}

export interface ProviderLiveDataTransportResponse {
  readonly status: number
  readonly body: string
  readonly headers?: Readonly<Record<string, string | undefined>>
}

export interface ProviderLiveDataReadTransport {
  get(input: Readonly<{ url: string; timeoutMs: number }>): Promise<ProviderLiveDataTransportResponse>
}

export interface ProviderLiveDataDigestPort {
  sha256(value: string): Promise<string>
}

export interface ProviderLiveDataReadAdapterOptions {
  readonly executionMode: ProviderLiveDataExecutionMode
  readonly transport: ProviderLiveDataReadTransport
  readonly digest: ProviderLiveDataDigestPort
  readonly now: () => string
}

export interface ProviderLiveDataReadExecution {
  readonly executionMode: Exclude<ProviderLiveDataExecutionMode, 'production'>
  readonly transportInvoked: true
  readonly method: 'GET'
  readonly evidence: ProviderLiveDataReadEvidence
}

const CREDENTIAL_SHAPE = /(api[_-]?key|access[_-]?token|password|secret|bearer|private[_-]?key)/i
const SAFE_PATH = /^\/[a-zA-Z0-9._~!$&'()*+,;=:@%/-]*$/

function positiveInteger(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null
}

function parseNonNegativeInteger(value: string | undefined): number | null {
  if (value == null || value.trim() === '') return null
  if (!/^\d+$/.test(value.trim())) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function normalizeOriginAndUrl(raw: string): { origin: string; url: string } {
  const url = new URL(raw)
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('invalid-source-url')
  if (!SAFE_PATH.test(url.pathname)) throw new Error('invalid-source-path')
  if (CREDENTIAL_SHAPE.test(url.search) || CREDENTIAL_SHAPE.test(url.pathname)) throw new Error('credential-shaped-source')
  return { origin: url.origin, url: url.toString() }
}

function execution(
  mode: Exclude<ProviderLiveDataExecutionMode, 'production'>,
  evidence: ProviderLiveDataReadEvidence,
): ProviderLiveDataReadExecution {
  return Object.freeze({ executionMode: mode, transportInvoked: true, method: 'GET', evidence })
}

export async function executeProviderLiveDataRead(
  request: ProviderLiveDataReadRequest,
  options: ProviderLiveDataReadAdapterOptions,
): Promise<ProviderLiveDataReadExecution> {
  if (options.executionMode === 'production') throw new Error('production-live-data-read-disabled')

  const timeoutMs = positiveInteger(request.timeoutMs)
  if (timeoutMs === null || timeoutMs > 30_000) throw new Error('invalid-timeout')

  const observedAt = new Date(request.observedAt)
  if (!Number.isFinite(observedAt.getTime())) throw new Error('invalid-observed-at')

  const source = normalizeOriginAndUrl(request.sourceUrl)
  const fetchedAt = new Date(options.now())
  if (!Number.isFinite(fetchedAt.getTime())) throw new Error('invalid-clock')

  let response: ProviderLiveDataTransportResponse
  try {
    response = await options.transport.get(Object.freeze({ url: source.url, timeoutMs }))
  } catch {
    return execution(options.executionMode, createProviderLiveDataReadEvidence({
      ...request,
      method: 'GET',
      sourceOrigin: source.origin,
      fetchedAt: fetchedAt.toISOString(),
      observedAt: observedAt.toISOString(),
      httpStatus: 503,
      resultCount: 0,
      dataSha256: await options.digest.sha256(''),
      etag: null,
      rateLimit: null,
      failureCode: 'transport_failure',
    }))
  }

  const body = String(response.body ?? '')
  const digest = await options.digest.sha256(body)
  const headers = response.headers ?? {}
  const resultCount = parseNonNegativeInteger(headers['x-result-count']) ?? (response.status >= 200 && response.status < 300 ? 1 : 0)
  const rateLimit = {
    limit: parseNonNegativeInteger(headers['x-ratelimit-limit']),
    remaining: parseNonNegativeInteger(headers['x-ratelimit-remaining']),
    resetAt: headers['x-ratelimit-reset-at'] ?? null,
  }
  const successful = response.status >= 200 && response.status < 300

  return execution(options.executionMode, createProviderLiveDataReadEvidence({
    tenantId: request.tenantId,
    environmentId: request.environmentId,
    connectionId: request.connectionId,
    providerId: request.providerId,
    capability: request.capability,
    method: 'GET',
    sourceOrigin: source.origin,
    fetchedAt: fetchedAt.toISOString(),
    observedAt: observedAt.toISOString(),
    httpStatus: response.status,
    resultCount,
    dataSha256: digest,
    etag: headers.etag ?? null,
    rateLimit,
    failureCode: successful ? null : 'provider_read_failed',
  }))
}
