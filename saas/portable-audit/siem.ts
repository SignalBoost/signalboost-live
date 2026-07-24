// saas/portable-audit/siem.ts
//
// Format any PortableAuditEvent into a standard SIEM record and ship it through a
// buyer-supplied transport. Two formats cover essentially every SIEM on the market:
//   • 'ecs-json' — Elastic Common Schema JSON. Ingested natively by Elastic, Splunk
//     (HEC), Datadog, Microsoft Sentinel, Sumo Logic, Chronicle. The modern default.
//   • 'cef'      — ArcSight Common Event Format over syslog. The legacy/enterprise
//     standard still required by ArcSight, QRadar, and many SOC pipelines.
//
// Zero imports, zero platform coupling. Pure functions + a sink factory.

import type {
  PortableAuditEvent,
  PortableAuditSink,
  SiemAuditSinkConfig,
  SiemFormat,
  SiemSeverity,
} from './types.ts'

// CEF numeric severity 0..10.
const CEF_SEVERITY: Record<SiemSeverity, number> = { info: 2, notice: 3, warning: 5, high: 7, critical: 9 }

function severityFor(event: PortableAuditEvent, cfg: SiemAuditSinkConfig): SiemSeverity {
  return cfg.severityFor ? (cfg.severityFor(event.eventType) ?? 'info') : 'info'
}

function flattenPayload(payload: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(payload ?? {})) {
    if (v === null || v === undefined) continue
    out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
  return out
}

export function formatEcsJson(event: PortableAuditEvent, cfg: SiemAuditSinkConfig): string {
  const severity = severityFor(event, cfg)
  const record: Record<string, unknown> = {
    '@timestamp': event.occurredAt,
    'event.kind': 'event',
    'event.category': [event.category ?? 'process'],
    'event.action': event.eventType,
    'event.id': event.eventId,
    'event.dataset': event.dataset,
    'event.severity': CEF_SEVERITY[severity],
    'log.level': severity,
    'observer.vendor': cfg.vendor ?? 'Portable',
    'observer.product': cfg.product ?? 'Portable',
    'observer.version': cfg.productVersion ?? 'unknown',
  }
  if (event.subjectId) record['entity.id'] = event.subjectId
  if (event.correlationId) record['trace.id'] = event.correlationId
  if (event.schemaVersion !== undefined) record['schema.version'] = event.schemaVersion
  if (cfg.tenantId) record['organization.id'] = cfg.tenantId
  if (cfg.environment) record['service.environment'] = cfg.environment
  const payload = flattenPayload(event.payload)
  if (Object.keys(payload).length > 0) record['portable.payload'] = payload
  return JSON.stringify(record)
}

// CEF requires escaping of \, |, = and newlines.
function cefEscapeHeader(s: string): string {
  return String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ')
}
function cefEscapeExt(s: string): string {
  return String(s).replace(/\\/g, '\\\\').replace(/=/g, '\\=').replace(/\n/g, ' ')
}

export function formatCef(event: PortableAuditEvent, cfg: SiemAuditSinkConfig): string {
  const severity = severityFor(event, cfg)
  const vendor = cefEscapeHeader(cfg.vendor ?? 'Portable')
  const product = cefEscapeHeader(cfg.product ?? 'Portable')
  const version = cefEscapeHeader(cfg.productVersion ?? 'unknown')
  const signatureId = cefEscapeHeader(event.eventType)
  const name = cefEscapeHeader(event.eventType)
  const header = `CEF:0|${vendor}|${product}|${version}|${signatureId}|${name}|${CEF_SEVERITY[severity]}`

  const ext: string[] = [
    `rt=${cefEscapeExt(event.occurredAt)}`,
    `externalId=${cefEscapeExt(event.eventId)}`,
    `cat=${cefEscapeExt(event.dataset)}`,
  ]
  if (event.subjectId) ext.push(`cs1Label=subjectId cs1=${cefEscapeExt(event.subjectId)}`)
  if (event.correlationId) ext.push(`cs2Label=correlationId cs2=${cefEscapeExt(event.correlationId)}`)
  if (event.schemaVersion !== undefined) ext.push(`cs3Label=schemaVersion cs3=${cefEscapeExt(String(event.schemaVersion))}`)
  if (cfg.tenantId) ext.push(`cs4Label=tenantId cs4=${cefEscapeExt(cfg.tenantId)}`)
  if (cfg.environment) ext.push(`deviceCustomDate1Label=environment dvchost=${cefEscapeExt(cfg.environment)}`)
  for (const [k, v] of Object.entries(flattenPayload(event.payload))) {
    ext.push(`${cefEscapeExt(k)}=${cefEscapeExt(v)}`)
  }
  return `${header}|${ext.join(' ')}`
}

export function formatAuditEvent(event: PortableAuditEvent, cfg: SiemAuditSinkConfig): string {
  return cfg.format === 'cef' ? formatCef(event, cfg) : formatEcsJson(event, cfg)
}

// Build a SIEM sink from config. A portable holds a PortableAuditSink and calls
// record(); this implementation formats + ships each event.
export function createSiemAuditSink(cfg: SiemAuditSinkConfig): PortableAuditSink {
  const swallow = cfg.swallowTransportErrors !== false // default true
  return {
    async record(event: PortableAuditEvent): Promise<void> {
      const severity = severityFor(event, cfg)
      const format: SiemFormat = cfg.format
      const line = formatAuditEvent(event, cfg)
      try {
        await cfg.transport.send(line, { eventType: event.eventType, occurredAt: event.occurredAt, severity, format })
      } catch (err) {
        if (!swallow) throw err
        // Swallowed by design: audit export must never break the portable. The
        // buyer's transport owns queue/retry/dead-letter.
      }
    },
  }
}

// Fan-out: keep the platform's own ledger AND ship to one or more SIEMs. Each
// sink is awaited; one failing sink never blocks the others.
export function teeAuditSinks(...sinks: PortableAuditSink[]): PortableAuditSink {
  return {
    async record(event: PortableAuditEvent): Promise<void> {
      await Promise.all(sinks.map(async (s) => { try { await s.record(event) } catch { /* isolate */ } }))
    },
  }
}
