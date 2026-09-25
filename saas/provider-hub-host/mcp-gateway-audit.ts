import type {
  PortableConnectorAuditEvent,
  PortableConnectorAuditPort,
} from '../provider-hub-core/connector-runtime.ts'

export const MCP_GATEWAY_AUDIT_VERSION = 'mcp-gateway-audit-v1' as const

function safeCode(value: unknown): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const match = raw.match(/^[a-z0-9_.:-]{1,160}/i)
  return match?.[0] ?? 'redacted_error'
}

export function createDurableMcpGatewayAuditPort(): PortableConnectorAuditPort {
  return Object.freeze({
    async append(event: PortableConnectorAuditEvent) {
      const { cosServiceDb } = await import('../lib/cos-core/storage/service-db.ts')
      const db = cosServiceDb()
      if (!db) throw new Error('mcp_gateway_audit_database_unavailable')
      const { error } = await db.from('provider_hub_mcp_audit').insert({
        event_id: event.eventId,
        occurred_at: event.occurredAt,
        tenant_id: event.tenantId,
        environment_id: event.environmentId,
        portable_id: event.portableId,
        capability_id: event.capabilityId,
        provider_id: event.providerId,
        connection_id: event.connectionId,
        risk: event.risk,
        requires_approval: event.requiresApproval,
        approval_id: event.approvalId ?? null,
        ok: event.ok,
        duration_ms: event.durationMs,
        mode: event.mode ?? null,
        error_code: safeCode(event.error),
        trace_id: event.traceId ?? null,
        audit_version: MCP_GATEWAY_AUDIT_VERSION,
      })
      if (error) throw new Error('mcp_gateway_audit_write_failed')
    },
  })
}
