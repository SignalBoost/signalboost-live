// saas/lib/supervisor/portable/siem-audit-sink.ts
//
// Enterprise SIEM audit export for the Self-Healing portable. Every supervisor
// action (dispatch requested/started/completed/failed, sandbox pause/resume, browser
// packaging, fencing, duplicate rejection) already flows through DispatchAuditSink.
// This module is a DispatchAuditSink implementation that formats each event into a
// standard SIEM format and ships it through a BUYER-SUPPLIED transport. It is what a
// buyer's security team requires for SOC 2 / ISO 27001 evidence: an immutable,
// timestamped, tamper-evident audit trail landing in THEIR SIEM (Splunk, Elastic,
// Microsoft Sentinel, Datadog, ArcSight, Chronicle, or a plain syslog collector).
//
// Host-agnostic: names no platform, reads no process.env, imports no host singleton.
// The buyer implements SiemTransport against their own collector; the buyer chooses
// the format. Two formats are built in because between them they cover essentially
// every SIEM on the market:
//   • 'ecs-json' — Elastic Common Schema JSON. Ingested natively by Elastic, Splunk
//     (HEC), Datadog, Microsoft Sentinel, Sumo Logic, Chronicle. The modern default.
//   • 'cef'      — ArcSight Common Event Format over syslog. The legacy/enterprise
//     standard still required by ArcSight, QRadar, and many SOC pipelines.

import type { DispatchAuditEvent, DispatchAuditEventType, DispatchAuditSink } from '../executors/executor-types.ts'
import type { SerializableValue } from '../incident-schema.ts'

export type SiemFormat = 'ecs-json' | 'cef'

// The buyer implements this against their SIEM collector (HTTPS endpoint, syslog
// socket, file, Kafka — their choice). One formatted record per call. It must not
// throw in a way that stops the supervisor; delivery failures are the buyer's
// transport concern (queue/retry/dead-letter on their side).
export interface SiemTransport {
  send(record: string, meta: Readonly<{ eventType: DispatchAuditEventType; occurredAt: string; severity: SiemSeverity }>): Promise<void> | void
}

export type SiemSeverity = 'info' | 'notice' | 'warning' | 'high' | 'critical'

export interface SiemAuditSinkConfig {
  transport: SiemTransport
  format: SiemFormat
  // Identifies the emitting product in the buyer's SIEM. The buyer sets these to
  // whatever their SOC expects — they are NOT the seller's identity.
  vendor?: string          // CEF device vendor / ECS observer.vendor. Default 'Portable'.
  product?: string         // CEF device product / ECS observer.product. Default 'SelfHealingSupervisor'.
  productVersion?: string  // CEF device version / ECS observer.version. Default 'unknown'.
  // Optional tenant/environment tags stamped on every record for multi-tenant SOCs.
  tenantId?: string
  environment?: string
  // If the buyer's transport throws, should we swallow (default true — never let audit
  // export break self-healing) or propagate? Security-strict buyers may set false.
  swallowTransportErrors?: boolean
}

// ── severity mapping ─────────────────────────────────────────────────────────
// Maps each supervisor event to a SIEM severity a SOC analyst expects to triage on.
const SEVERITY: Record<DispatchAuditEventType, SiemSeverity> = {
  dispatch_requested: 'info',
  dispatch_started: 'info',
  dispatch_completed: 'notice',
  dispatch_rejected: 'warning',
  dispatch_failed: 'high',
  dispatch_fenced: 'warning',
  executor_missing: 'high',
  duplicate_dispatch_rejected: 'notice',
  browser_adapter_started: 'info',
  browser_package_created: 'notice',
  browser_package_rejected: 'warning',
  browser_dry_run_ready: 'info',
  sandbox_execution_requested: 'info',
  sandbox_package_promoted: 'notice',
  sandbox_execution_started: 'info',
  sandbox_execution_paused: 'warning',      // a dangerous step paused for human approval
  sandbox_continuation_started: 'notice',
  sandbox_execution_completed: 'notice',
  sandbox_execution_failed: 'high',
  sandbox_verification_failed: 'high',
}

// CEF numeric severity 0..10.
const CEF_SEVERITY: Record<SiemSeverity, number> = { info: 2, notice: 3, warning: 5, high: 7, critical: 9 }

function severityFor(t: DispatchAuditEventType): SiemSeverity { return SEVERITY[t] ?? 'info' }

// ── formatting ───────────────────────────────────────────────────────────────
function flattenPayload(payload: Record<string, SerializableValue>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(payload ?? {})) {
    if (v === null || v === undefined) continue
    out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
  return out
}

// CEF requires escaping of \, |, = and newlines.
function cefEscapeHeader(s: string): string { return String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ') }
function cefEscapeExt(s: string): string { return String(s).replace(/\\/g, '\\\\').replace(/=/g, '\\=').replace(/\n/g, ' ') }

export function formatEcsJson(event: DispatchAuditEvent, cfg: SiemAuditSinkConfig): string {
  const severity = severityFor(event.eventType)
  const record: Record<string, unknown> = {
    '@timestamp': event.occurredAt,
    'event.kind': 'event',
    'event.category': ['configuration', 'process'],
    'event.action': event.eventType,
    'event.id': event.eventId,
    'event.dataset': 'self_healing.supervisor',
    'event.severity': CEF_SEVERITY[severity],
    'log.level': severity,
    'observer.vendor': cfg.vendor ?? 'Portable',
    'observer.product': cfg.product ?? 'SelfHealingSupervisor',
    'observer.version': cfg.productVersion ?? 'unknown',
    'incident.id': event.incidentId,
    'dispatch.id': event.dispatchId,
    'schema.version': event.schemaVersion,
    'supervisor.payload': flattenPayload(event.payload),
  }
  if (cfg.tenantId) record['organization.id'] = cfg.tenantId
  if (cfg.environment) record['service.environment'] = cfg.environment
  return JSON.stringify(record)
}

export function formatCef(event: DispatchAuditEvent, cfg: SiemAuditSinkConfig): string {
  const severity = severityFor(event.eventType)
  const vendor = cefEscapeHeader(cfg.vendor ?? 'Portable')
  const product = cefEscapeHeader(cfg.product ?? 'SelfHealingSupervisor')
  const version = cefEscapeHeader(cfg.productVersion ?? 'unknown')
  const name = cefEscapeHeader(event.eventType)
  // CEF:0|Vendor|Product|Version|SignatureID|Name|Severity|Extension
  const header = `CEF:0|${vendor}|${product}|${version}|${event.eventType}|${name}|${CEF_SEVERITY[severity]}`
  const ext: string[] = [
    `rt=${cefEscapeExt(event.occurredAt)}`,
    `externalId=${cefEscapeExt(event.eventId)}`,
    `cs1Label=incidentId cs1=${cefEscapeExt(event.incidentId)}`,
    `cs2Label=dispatchId cs2=${cefEscapeExt(event.dispatchId)}`,
    `cs3Label=schemaVersion cs3=${cefEscapeExt(event.schemaVersion)}`,
  ]
  if (cfg.tenantId) ext.push(`cs4Label=tenantId cs4=${cefEscapeExt(cfg.tenantId)}`)
  if (cfg.environment) ext.push(`deviceCustomString5Label=environment cs5=${cefEscapeExt(cfg.environment)}`)
  for (const [k, v] of Object.entries(flattenPayload(event.payload))) {
    ext.push(`${cefEscapeExt(k)}=${cefEscapeExt(v)}`)
  }
  return `${header}|${ext.join(' ')}`
}

export function formatSiemRecord(event: DispatchAuditEvent, cfg: SiemAuditSinkConfig): string {
  return cfg.format === 'cef' ? formatCef(event, cfg) : formatEcsJson(event, cfg)
}

// ── the sink ─────────────────────────────────────────────────────────────────
// Drops into the supervisor's existing audit path (it IS a DispatchAuditSink), so no
// core change is needed: wherever the platform passes an audit sink, a buyer passes
// this one built against their SIEM.
export function createSiemAuditSink(cfg: SiemAuditSinkConfig): DispatchAuditSink {
  const swallow = cfg.swallowTransportErrors !== false
  return {
    async write(event: Readonly<DispatchAuditEvent>): Promise<void> {
      const record = formatSiemRecord(event as DispatchAuditEvent, cfg)
      const severity = severityFor(event.eventType)
      try {
        await cfg.transport.send(record, { eventType: event.eventType, occurredAt: event.occurredAt, severity })
      } catch (err) {
        if (!swallow) throw err
        // Swallowed: audit export must never break self-healing. The buyer's transport
        // owns durability (queue/retry/dead-letter).
      }
    },
  }
}

// Fan-out helper: emit to the buyer's SIEM AND keep the platform's own audit sink
// (e.g. the durable ledger) in the same call, so enabling SIEM export does not drop
// the existing trail.
export function teeAuditSinks(...sinks: DispatchAuditSink[]): DispatchAuditSink {
  return {
    async write(event: Readonly<DispatchAuditEvent>): Promise<void> {
      for (const s of sinks) { await s.write(event) }
    },
  }
}
