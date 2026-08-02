//
// EVIDENCE MUST NOT ASSERT WHAT NOBODY CHECKED.
//
// `networkAccessPerformed` was a hardcoded `false` on every record — including records produced
// immediately after the adapter had invoked the buyer's transport and made a real GET. The field
// read like a verified safety property and was in fact a constant, so a reviewer reading the
// evidence for a completed live read was told no network access occurred. It is now supplied by
// the caller that actually knows, defaults to false for direct construction, and is set true by
// the adapter whenever the transport is invoked — including when that transport throws, because
// an attempt that fails is still an attempt.
//
// The three siblings around it are true BY CONSTRUCTION and stay literal, which is the
// distinction worth preserving: `providerMutationPerformed` is false because the adapter only
// ever issues GET; `credentialsExposed` and `rawPayloadStored` are false because this record
// holds an origin and a digest and has no field a payload or a secret could occupy. Those are
// structural guarantees. Network access was never one.

export const PROVIDER_LIVE_DATA_READ_EVIDENCE_SCHEMA_VERSION = 'provider-live-data-read-evidence-v1' as const

export type ProviderLiveDataReadState = 'validated' | 'blocked'

export interface ProviderLiveDataReadEvidence {
  readonly schemaVersion: typeof PROVIDER_LIVE_DATA_READ_EVIDENCE_SCHEMA_VERSION
  readonly state: ProviderLiveDataReadState
  readonly tenantId: string
  readonly environmentId: string
  readonly connectionId: string
  readonly providerId: string
  readonly capability: string
  readonly method: 'GET'
  readonly sourceOrigin: string
  readonly fetchedAt: string
  readonly observedAt: string
  readonly freshnessSeconds: number
  readonly httpStatus: number
  readonly resultCount: number
  readonly dataSha256: string
  readonly etag: string | null
  readonly rateLimit: Readonly<{ limit: number | null; remaining: number | null; resetAt: string | null }>
  readonly failureCode: string | null
  readonly blockers: readonly string[]
  /** True when a transport was actually invoked. Not a constant — see the header. */
  readonly networkAccessPerformed: boolean
  readonly providerMutationPerformed: false
  readonly credentialsExposed: false
  readonly rawPayloadStored: false
}

const SHA256 = /^[a-f0-9]{64}$/
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/
const SAFE_CAPABILITY = /^read:[a-z0-9][a-z0-9._-]{0,63}$/
const SAFE_FAILURE = /^[a-z][a-z0-9_-]{0,63}$/
const CREDENTIAL_SHAPE = /(api[_-]?key|access[_-]?token|password|secret|bearer|private[_-]?key)/i

function text(value: unknown): string { return String(value ?? '').trim() }
function iso(value: unknown): string | null {
  const normalized = text(value)
  return normalized && Number.isFinite(Date.parse(normalized)) ? new Date(normalized).toISOString() : null
}
function integer(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null
}

export function createProviderLiveDataReadEvidence(input: Record<string, unknown>): ProviderLiveDataReadEvidence {
  const blockers = new Set<string>()
  const allowed = new Set(['tenantId','environmentId','connectionId','providerId','capability','method','sourceOrigin','fetchedAt','observedAt','httpStatus','resultCount','dataSha256','etag','rateLimit','failureCode','networkAccessPerformed'])
  for (const key of Object.keys(input)) if (!allowed.has(key)) blockers.add(`unknown-key:${key}`)

  const tenantId = text(input.tenantId)
  const environmentId = text(input.environmentId)
  const connectionId = text(input.connectionId)
  const providerId = text(input.providerId)
  for (const [name, value] of Object.entries({ tenantId, environmentId, connectionId, providerId })) if (!SAFE_ID.test(value)) blockers.add(`invalid-${name}`)

  const capability = text(input.capability)
  if (!SAFE_CAPABILITY.test(capability)) blockers.add('invalid-capability')
  if (input.method !== 'GET') blockers.add('method-must-be-get')

  let sourceOrigin = ''
  try {
    const url = new URL(text(input.sourceOrigin))
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) blockers.add('invalid-source-origin')
    sourceOrigin = url.origin
  } catch { blockers.add('invalid-source-origin') }
  if (CREDENTIAL_SHAPE.test(text(input.sourceOrigin))) blockers.add('credential-shaped-source')

  const fetchedAt = iso(input.fetchedAt)
  const observedAt = iso(input.observedAt)
  if (!fetchedAt) blockers.add('invalid-fetched-at')
  if (!observedAt) blockers.add('invalid-observed-at')
  const freshnessSeconds = fetchedAt && observedAt ? Math.floor((Date.parse(observedAt) - Date.parse(fetchedAt)) / 1000) : -1
  if (freshnessSeconds < 0 || freshnessSeconds > 86400) blockers.add('invalid-freshness')

  const httpStatus = integer(input.httpStatus)
  if (httpStatus === null || httpStatus < 100 || httpStatus > 599) blockers.add('invalid-http-status')
  const resultCount = integer(input.resultCount)
  if (resultCount === null) blockers.add('invalid-result-count')
  const dataSha256 = text(input.dataSha256).toLowerCase()
  if (!SHA256.test(dataSha256)) blockers.add('invalid-data-sha256')

  const rawEtag = input.etag == null ? null : text(input.etag)
  const etagUnsafe = Boolean(rawEtag && (rawEtag.length > 256 || CREDENTIAL_SHAPE.test(rawEtag)))
  if (etagUnsafe) blockers.add('invalid-etag')
  const etag = etagUnsafe ? null : rawEtag
  const failureCode = input.failureCode == null ? null : text(input.failureCode)
  if (failureCode && !SAFE_FAILURE.test(failureCode)) blockers.add('invalid-failure-code')
  if (httpStatus !== null && httpStatus >= 200 && httpStatus < 300 && failureCode) blockers.add('success-cannot-have-failure-code')
  if (httpStatus !== null && (httpStatus < 200 || httpStatus >= 300) && !failureCode) blockers.add('failure-code-required')

  const rateLimitPresent = Object.prototype.hasOwnProperty.call(input, 'rateLimit') && input.rateLimit != null
  const rateLimitValidContainer = !rateLimitPresent || (typeof input.rateLimit === 'object' && !Array.isArray(input.rateLimit))
  if (!rateLimitValidContainer) blockers.add('invalid-rate-limit-container')
  const rawRate = rateLimitValidContainer && input.rateLimit ? input.rateLimit as Record<string, unknown> : {}
  for (const key of Object.keys(rawRate)) if (!['limit','remaining','resetAt'].includes(key)) blockers.add(`unknown-rate-limit-key:${key}`)
  const limit = rawRate.limit == null ? null : integer(rawRate.limit)
  const remaining = rawRate.remaining == null ? null : integer(rawRate.remaining)
  const resetAt = rawRate.resetAt == null ? null : iso(rawRate.resetAt)
  if (rawRate.limit != null && limit === null) blockers.add('invalid-rate-limit')
  if (rawRate.remaining != null && remaining === null) blockers.add('invalid-rate-remaining')
  if (limit !== null && remaining !== null && remaining > limit) blockers.add('rate-remaining-exceeds-limit')
  if (rawRate.resetAt != null && !resetAt) blockers.add('invalid-rate-reset-at')

  // Absent means false: a caller constructing evidence by hand has performed no read, and the
  // adapter — the only producer that has — states it explicitly.
  const networkAccessPerformed = input.networkAccessPerformed === true

  const sorted = Object.freeze([...blockers].sort())
  return Object.freeze({
    schemaVersion: PROVIDER_LIVE_DATA_READ_EVIDENCE_SCHEMA_VERSION,
    state: sorted.length === 0 ? 'validated' : 'blocked',
    tenantId, environmentId, connectionId, providerId, capability,
    method: 'GET', sourceOrigin, fetchedAt: fetchedAt ?? '', observedAt: observedAt ?? '',
    freshnessSeconds, httpStatus: httpStatus ?? 0, resultCount: resultCount ?? 0,
    dataSha256, etag, rateLimit: Object.freeze({ limit, remaining, resetAt }), failureCode,
    blockers: sorted, networkAccessPerformed, providerMutationPerformed: false,
    credentialsExposed: false, rawPayloadStored: false,
  })
}
