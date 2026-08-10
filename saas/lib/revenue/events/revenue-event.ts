import { REVENUE_EVENT_SCHEMA_VERSION, type RevenueEvent, type RevenueEventInput } from './types.ts'

const SECRET_KEY = /(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|cookie|private[_-]?key)/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/

function assertNonEmpty(value: string | undefined, field: string): void {
  if (!value || !value.trim()) throw new Error(`${field}_required`)
}

function assertIsoTimestamp(value: string, field: string): void {
  if (!ISO_DATE.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`${field}_invalid`)
}

function assertSafeValue(value: unknown, path: string): void {
  if (value === null || value === undefined) return
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${path}_non_finite`)
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') throw new Error(`${path}_non_json_value`)
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) assertSafeValue(value[i], `${path}[${i}]`)
    return
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(key)) throw new Error('secret_shaped_metadata_rejected')
      assertSafeValue(nested, `${path}.${key}`)
    }
  }
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested)
  return value
}

function normalizeCurrency(currency: string | undefined): string | undefined {
  if (!currency) return undefined
  const normalized = currency.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error('currency_invalid')
  return normalized
}

export function buildRevenueEvent(input: RevenueEventInput, now = new Date().toISOString()): RevenueEvent {
  assertNonEmpty(input.eventId, 'event_id')
  assertNonEmpty(input.tenant?.tenantId, 'tenant_id')
  assertNonEmpty(input.tenant?.environmentId, 'environment_id')
  assertIsoTimestamp(input.occurredAt, 'occurred_at')

  const receivedAt = input.receivedAt ?? now
  assertIsoTimestamp(receivedAt, 'received_at')

  if (input.value !== undefined && (!Number.isFinite(input.value) || input.value < 0)) throw new Error('value_invalid')
  const currency = normalizeCurrency(input.currency)
  if ((input.value === undefined) !== (currency === undefined)) throw new Error('value_currency_pair_required')

  const confidence = input.confidence ?? 1
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('confidence_invalid')

  const metadata = input.metadata ?? {}
  assertSafeValue(metadata, 'metadata')

  const event: RevenueEvent = {
    schemaVersion: REVENUE_EVENT_SCHEMA_VERSION,
    eventId: input.eventId.trim(),
    tenant: { ...input.tenant },
    occurredAt: input.occurredAt,
    receivedAt,
    type: input.type,
    source: input.source,
    ...(input.sourceProvider?.trim() ? { sourceProvider: input.sourceProvider.trim() } : {}),
    ...(input.actor ? { actor: { ...input.actor } } : {}),
    ...(input.organization ? { organization: { ...input.organization } } : {}),
    ...(input.contact ? { contact: { ...input.contact } } : {}),
    ...(input.campaign ? { campaign: { ...input.campaign } } : {}),
    ...(input.opportunityId?.trim() ? { opportunityId: input.opportunityId.trim() } : {}),
    ...(input.pipelineId?.trim() ? { pipelineId: input.pipelineId.trim() } : {}),
    ...(input.value !== undefined ? { value: input.value, currency } : {}),
    metadata: { ...metadata },
    confidence,
    evidenceRefs: [...new Set(input.evidenceRefs ?? [])].filter(Boolean).sort(),
    ...(input.correlationId?.trim() ? { correlationId: input.correlationId.trim() } : {}),
    ...(input.parentEventId?.trim() ? { parentEventId: input.parentEventId.trim() } : {}),
  }

  if (event.parentEventId === event.eventId) throw new Error('self_parent_event_rejected')
  return deepFreeze(event)
}

export function isRevenueEvent(value: unknown): value is RevenueEvent {
  if (!value || typeof value !== 'object') return false
  try {
    const candidate = value as RevenueEvent
    buildRevenueEvent({ ...candidate, receivedAt: candidate.receivedAt })
    return candidate.schemaVersion === REVENUE_EVENT_SCHEMA_VERSION
  } catch {
    return false
  }
}
