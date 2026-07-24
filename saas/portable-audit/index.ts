// saas/portable-audit/index.ts
//
// Shared SIEM/audit-export primitive for every portable (SOC 2 / ISO 27001
// evidence into a buyer's SIEM). Host-agnostic: zero platform coupling, zero env,
// zero credentials. A portable emits PortableAuditEvents through a PortableAuditSink;
// createSiemAuditSink formats them (ECS-JSON or CEF) and ships via a buyer transport.
export * from './types.ts'
export * from './siem.ts'
