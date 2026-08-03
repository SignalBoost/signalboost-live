// saas/provider-hub-core/live-data-read-adapter.ts
import { createProviderLiveDataReadEvidence } from './live-data-read-evidence.ts'
import type { ProviderLiveDataReadEvidence } from './live-data-read-evidence.ts'

//
// PRODUCTION READS ARE NOW POSSIBLE, AND STILL GATED.
//
// Until now `executionMode: 'production'` threw outright. That made the portable safe and
// unsellable in the same line: a buyer cannot run a product whose production path is disabled,
// and "switch it on later" is not something anyone signs for.
//
// It is not simply switched on. Production requires an AUTHORISATION RECORD — a named approver,
// when they approved, and the exact origins the approval covers — supplied at construction and
// checked on every read. The same shape as the ads spend gate and the browser origin allowlist,
// for the same reason: the authorising decision should be recorded where it is enforced rather
// than assumed to have happened somewhere upstream.
//
// Two properties worth stating plainly to a security reviewer:
//
//   THE APPROVAL NAMES ORIGINS, not endpoints. An approval for one API is not an approval for
//   every API a configuration file happens to list later.
//
//   AN EXPIRED APPROVAL IS REFUSED, not warned about. An authorisation with no end is not an
//   authorisation; it is a permanent grant nobody revisits.

export type ProviderLiveDataExecutionMode = 'test' | 'staging' | 'production'

/**
 * What makes a production read permissible.
 *
 * Deliberately verbose. Every field here is something an auditor asks for by name after the
 * fact: who, when, over what, and until when.
 */
export interface ProviderLiveDataProductionAuthorization {
  /** The person or role who authorised production reads. Never a system name. */
  readonly approvedBy: string
  /** ISO timestamp of the approval. */
  readonly approvedAt: string
  /** ISO timestamp after which this authorisation is no longer valid. */
  readonly expiresAt: string
  /** Exact https origins this approval covers. A read outside them is refused. */
  readonly approvedOrigins: readonly string[]
  /** Free text carried into the record — a ticket number, a change reference. */
  readonly reference?: string
}

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

export interface ProviderLiveDataDigestPort { sha256(value: string): Promise<string> }

export interface ProviderLiveDataReadAdapterOptions {
  readonly executionMode: ProviderLiveDataExecutionMode
  readonly transport: ProviderLiveDataReadTransport
  readonly digest: ProviderLiveDataDigestPort
  readonly now: () => string
  /** Required for executionMode 'production'. Ignored in test and staging. */
  readonly productionAuthorization?: ProviderLiveDataProductionAuthorization
}

export interface ProviderLiveDataReadExecution {
  readonly executionMode: ProviderLiveDataExecutionMode
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
  if (value == null || value.trim() === '' || !/^\d+$/.test(value.trim())) return null
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

function execution(mode: ProviderLiveDataExecutionMode, evidence: ProviderLiveDataReadEvidence): ProviderLiveDataReadExecution {
  return Object.freeze({ executionMode: mode, transportInvoked: true, method: 'GET', evidence })
}

/**
 * Refuse a production read unless it was actually authorised.
 *
 * Every refusal is a distinct, stable code. One generic "not authorised" would make a missing
 * approval and an expired one look identical, and those need different actions from different
 * people.
 */
function assertProductionAuthorized(
  options: ProviderLiveDataReadAdapterOptions,
  request: ProviderLiveDataReadRequest,
): void {
  const approval = options.productionAuthorization
  if (!approval) throw new Error('production-authorization-required')
  if (!String(approval.approvedBy || '').trim()) throw new Error('production-approver-required')

  const approvedAt = Date.parse(String(approval.approvedAt || ''))
  const expiresAt = Date.parse(String(approval.expiresAt || ''))
  if (!Number.isFinite(approvedAt)) throw new Error('production-approval-timestamp-invalid')
  if (!Number.isFinite(expiresAt)) throw new Error('production-approval-expiry-required')

  // The clock comes from the injected `now`, not from the host's Date, so a test can pin it and
  // a buyer's deployment cannot disagree with its own evidence about when a read happened.
  const at = Date.parse(options.now())
  if (!Number.isFinite(at)) throw new Error('invalid-clock')
  if (at < approvedAt) throw new Error('production-approval-not-yet-valid')
  if (at >= expiresAt) throw new Error('production-approval-expired')

  const origins = Array.isArray(approval.approvedOrigins) ? approval.approvedOrigins : []
  if (origins.length === 0) throw new Error('production-approved-origins-required')

  let requested: URL
  try {
    requested = new URL(request.sourceUrl)
  } catch {
    throw new Error('invalid-source-url')
  }
  const permitted = new Set(
    origins
      .map(value => {
        try {
          const parsed = new URL(String(value))
          return parsed.origin === String(value) && parsed.protocol === 'https:' ? parsed.origin : ''
        } catch {
          return ''
        }
      })
      .filter(Boolean),
  )
  if (permitted.size === 0) throw new Error('production-approved-origins-invalid')
  if (!permitted.has(requested.origin)) throw new Error('production-origin-not-approved')
}

export async function executeProviderLiveDataRead(
  request: ProviderLiveDataReadRequest,
  options: ProviderLiveDataReadAdapterOptions,
): Promise<ProviderLiveDataReadExecution> {
  if (options.executionMode === 'production') assertProductionAuthorized(options, request)
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
      tenantId: request.tenantId,
      environmentId: request.environmentId,
      connectionId: request.connectionId,
      providerId: request.providerId,
      capability: request.capability,
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
      // The transport was invoked and threw. An attempt that fails is still an attempt, and the
      // evidence for a failed read must not read as though no network was touched.
      networkAccessPerformed: true,
    }))
  }

  const body = String(response.body ?? '')
  const headers = response.headers ?? {}
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
    resultCount: parseNonNegativeInteger(headers['x-result-count']) ?? (successful ? 1 : 0),
    dataSha256: await options.digest.sha256(body),
    etag: headers.etag ?? null,
    rateLimit: {
      limit: parseNonNegativeInteger(headers['x-ratelimit-limit']),
      remaining: parseNonNegativeInteger(headers['x-ratelimit-remaining']),
      resetAt: headers['x-ratelimit-reset-at'] ?? null,
    },
    failureCode: successful ? null : 'provider_read_failed',
    networkAccessPerformed: true,
  }))
}
