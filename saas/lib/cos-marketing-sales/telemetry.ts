// saas/lib/cos-marketing-sales/telemetry.ts
// Azure-ready telemetry payloads for COS Marketing + Sales.
// All user interaction events are clean JSON envelopes that can be streamed into
// Azure Event Hub, written to Cosmos DB, or converted to Azure ML feature rows.

import type { CosLocale } from './types'

export const COS_TELEMETRY_SCHEMA_VERSION = 'cos.telemetry.v1' as const

export type CosTelemetryEventName =
  | 'ui.click'
  | 'ui.scroll_depth'
  | 'content.approved'
  | 'content.rejected'
  | 'lead.capture.created'
  | 'outreach.plan.created'
  | 'outreach.domain_throttle.blocked'
  | 'audio.sequence.created'
  | 'print.payload.compiled'

export type CosTelemetrySource =
  | 'public_window_nav'
  | 'public_product_page'
  | 'lead_intake'
  | 'dashboard'
  | 'admin_console'
  | 'api_route'
  | 'worker'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

export type CosTelemetryIdentity = {
  workspaceId?: string
  userId?: string
  anonymousId?: string
  sessionId?: string
}

export type CosTelemetryEvent = {
  id: string
  schemaVersion: typeof COS_TELEMETRY_SCHEMA_VERSION
  eventName: CosTelemetryEventName
  eventSource: CosTelemetrySource
  locale?: CosLocale
  identity: CosTelemetryIdentity
  target?: {
    type?: string
    id?: string
    href?: string
    labelKey?: string
  }
  payload: JsonObject
  occurredAt: string
}

export type AzureEventHubEnvelope = {
  body: CosTelemetryEvent
  applicationProperties: {
    schemaVersion: typeof COS_TELEMETRY_SCHEMA_VERSION
    eventName: CosTelemetryEventName
    eventSource: CosTelemetrySource
    workspaceId?: string
    locale?: CosLocale
  }
  partitionKey: string
}

export type CosmosTelemetryDocument = CosTelemetryEvent & {
  pk: string
  ttl?: number
}

export type AzureMlFeatureRow = {
  event_id: string
  event_name: CosTelemetryEventName
  event_source: CosTelemetrySource
  workspace_id: string
  anonymous_id: string
  locale: string
  occurred_at: string
  target_type: string
  target_id: string
  payload_feature_count: number
}

function fallbackId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `cos_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function cleanJson(value: unknown, depth = 0): JsonValue {
  if (depth > 6) return null
  if (value === null) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.slice(0, 100).map(item => cleanJson(item, depth + 1))
  if (typeof value === 'object') {
    const output: JsonObject = {}
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (!key || key.length > 80) continue
      output[key] = cleanJson(raw, depth + 1)
    }
    return output
  }
  return null
}

function partitionKey(identity: CosTelemetryIdentity) {
  return identity.workspaceId || identity.userId || identity.anonymousId || identity.sessionId || 'anonymous'
}

export function createCosTelemetryEvent(params: {
  eventName: CosTelemetryEventName
  eventSource: CosTelemetrySource
  identity?: CosTelemetryIdentity
  locale?: CosLocale
  target?: CosTelemetryEvent['target']
  payload?: Record<string, unknown>
  occurredAt?: string
}): CosTelemetryEvent {
  return {
    id: fallbackId(),
    schemaVersion: COS_TELEMETRY_SCHEMA_VERSION,
    eventName: params.eventName,
    eventSource: params.eventSource,
    locale: params.locale,
    identity: params.identity || {},
    target: params.target,
    payload: cleanJson(params.payload || {}) as JsonObject,
    occurredAt: params.occurredAt || new Date().toISOString(),
  }
}

export function toAzureEventHubEnvelope(event: CosTelemetryEvent): AzureEventHubEnvelope {
  return {
    body: event,
    applicationProperties: {
      schemaVersion: event.schemaVersion,
      eventName: event.eventName,
      eventSource: event.eventSource,
      workspaceId: event.identity.workspaceId,
      locale: event.locale,
    },
    partitionKey: partitionKey(event.identity),
  }
}

export function toCosmosTelemetryDocument(event: CosTelemetryEvent, ttl?: number): CosmosTelemetryDocument {
  return {
    ...event,
    pk: partitionKey(event.identity),
    ttl,
  }
}

export function toAzureMlFeatureRow(event: CosTelemetryEvent): AzureMlFeatureRow {
  return {
    event_id: event.id,
    event_name: event.eventName,
    event_source: event.eventSource,
    workspace_id: event.identity.workspaceId || '',
    anonymous_id: event.identity.anonymousId || '',
    locale: event.locale || '',
    occurred_at: event.occurredAt,
    target_type: event.target?.type || '',
    target_id: event.target?.id || '',
    payload_feature_count: Object.keys(event.payload || {}).length,
  }
}

export function buildClickEvent(params: {
  source: CosTelemetrySource
  href?: string
  labelKey?: string
  targetId?: string
  identity?: CosTelemetryIdentity
  locale?: CosLocale
}) {
  return createCosTelemetryEvent({
    eventName: 'ui.click',
    eventSource: params.source,
    identity: params.identity,
    locale: params.locale,
    target: { type: 'link_or_button', id: params.targetId, href: params.href, labelKey: params.labelKey },
    payload: { href: params.href || '', labelKey: params.labelKey || '' },
  })
}
