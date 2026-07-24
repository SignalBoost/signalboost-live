// saas/portable-audit/types.ts
//
// Shared, host-agnostic SIEM/audit-export contracts for EVERY portable.
//
// Enterprise checklist item: a Fortune-500 security team requires an immutable,
// timestamped audit trail landing in THEIR SIEM (Splunk, Elastic, Microsoft
// Sentinel, Datadog, ArcSight, QRadar, Chronicle, or a syslog collector) as SOC 2
// / ISO 27001 evidence. Each portable already produces audit events; this module
// turns any of them into a standard SIEM record and ships it through a
// BUYER-SUPPLIED transport.
//
// Host-agnostic by construction: names no platform, reads no environment, imports
// no host singleton, holds no credentials. The buyer implements SiemTransport
// against their own collector and chooses the format.

// A portable's audit event, normalized. A portable maps its own internal event
// (a published campaign, a render charge, a provider key rotation, a supervisor
// dispatch) onto this shape. `payload` MUST already be sanitized and serializable
// — never put secrets, tokens, raw provider responses, or PII here.
export interface PortableAuditEvent {
  eventId: string
  // The portable's own action name, e.g. 'campaign.published', 'render.charged',
  // 'provider.key_rotated', 'press.dispatched'.
  eventType: string
  // ISO-8601 timestamp of when the action occurred.
  occurredAt: string
  // ECS event.dataset — identifies the emitting portable, e.g. 'press_media',
  // 'render', 'campaign', 'self_healing.supervisor'.
  dataset: string
  // ECS event.category hint. Default 'process'.
  category?: string
  schemaVersion?: string | number
  // The primary entity the event is about (campaign id, render id, incident id).
  subjectId?: string
  // Trace / incident correlation id, when the portable has one.
  correlationId?: string
  // Sanitized, serializable detail. Flattened into the SIEM record.
  payload?: Record<string, unknown>
}

export type SiemFormat = 'ecs-json' | 'cef'
export type SiemSeverity = 'info' | 'notice' | 'warning' | 'high' | 'critical'

// The buyer implements this against their SIEM collector (HTTPS endpoint, syslog
// socket, file, Kafka — their choice). One formatted record per call.
export interface SiemTransport {
  send(
    record: string,
    meta: Readonly<{ eventType: string; occurredAt: string; severity: SiemSeverity; format: SiemFormat }>,
  ): Promise<void> | void
}

export interface SiemAuditSinkConfig {
  transport: SiemTransport
  format: SiemFormat
  // Identify the emitting product in the buyer's SIEM. The buyer/portable sets
  // these to whatever their SOC expects — they are NOT the seller's identity.
  vendor?: string          // CEF device vendor / ECS observer.vendor. Default 'Portable'.
  product?: string         // CEF device product / ECS observer.product. Default 'Portable'.
  productVersion?: string  // CEF device version / ECS observer.version. Default 'unknown'.
  // Optional tenant/environment tags stamped on every record for multi-tenant SOCs.
  tenantId?: string
  environment?: string
  // Each portable supplies its own event-type → severity mapping so a SOC analyst
  // triages on the right level. Omitted → every event is 'info'.
  severityFor?: (eventType: string) => SiemSeverity
  // If the buyer's transport throws, swallow (default true — audit export must
  // never break the portable) or propagate. Security-strict buyers set false.
  swallowTransportErrors?: boolean
}

// What a portable calls to emit an audit event. A portable depends only on this
// interface, so a buyer can swap the SIEM sink for their own, or tee several.
export interface PortableAuditSink {
  record(event: PortableAuditEvent): Promise<void>
}
