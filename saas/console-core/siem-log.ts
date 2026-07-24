// saas/console-core/siem-log.ts
//
// Reference adapter: ship the Console operator OS's action audit trail to a buyer's
// SIEM through the shared portable-audit primitive, with ZERO change to the console
// engine. Every provider action (create/rotate a key, a Stripe or Vercel env change,
// a GitHub or DNS operation) already flows through the injected LogAdapter.logAction
// (see actionEngine.ts) — the most audit-critical events a Fortune-500 SOC watches.
// A buyer passes createSiemConsoleLog(...) as the `log` argument to createHost().
//
// Host-agnostic: LogAdapter is a console-core type and @/portable-audit is a
// zero-dependency peer primitive, so this file names no platform, reads no env, and
// holds no credentials.

import type { LogAdapter } from './types'
import {
  createSiemAuditSink,
  type PortableAuditEvent,
  type SiemAuditSinkConfig,
  type SiemSeverity,
} from '@/portable-audit'

const DATASET = 'console'

// A failed provider action is high-signal for a SOC; a successful one (a key was
// rotated, an env var changed) is still audit-worthy.
const SEVERITY: Record<string, SiemSeverity> = {
  'console.action_success': 'notice',
  'console.action_error': 'high',
}
function severityFor(eventType: string): SiemSeverity {
  return SEVERITY[eventType] ?? 'info'
}

type ConsoleActionEvent = Parameters<LogAdapter['logAction']>[0]

let seq = 0
function eventFromAction(event: ConsoleActionEvent): PortableAuditEvent {
  return {
    eventId: `con_${Date.now()}_${(seq++).toString(36)}`,
    eventType: `console.action_${event.status}`,
    occurredAt: event.timestamp,
    dataset: DATASET,
    category: 'configuration',
    subjectId: `${event.providerId}.${event.actionId}`,
    payload: {
      providerId: event.providerId,
      actionId: event.actionId,
      status: event.status,
      ...(event.userId ? { userId: event.userId } : {}),
      ...(event.inputSummary !== undefined ? { inputSummary: event.inputSummary } : {}),
      ...(event.errorMessage ? { errorMessage: event.errorMessage } : {}),
    },
  }
}

export interface SiemConsoleLogOptions {
  // The buyer's SIEM config (transport + format + product/tenant tags). `severityFor`
  // is supplied internally; any on this config is ignored.
  siem: Omit<SiemAuditSinkConfig, 'severityFor'>
  // Optional: also forward to another LogAdapter (e.g. the console's own audit table),
  // so the SIEM export and a queryable ledger both happen.
  delegate?: LogAdapter
}

export function createSiemConsoleLog(opts: SiemConsoleLogOptions): LogAdapter {
  const sink = createSiemAuditSink({ product: 'ControlCenter', ...opts.siem, severityFor })
  const delegate = opts.delegate
  return {
    // logAction is async and awaited by the action engine. Provider actions are
    // human-driven and audit completeness matters, so the SIEM record is awaited
    // (the sink swallows transport errors by default, so this never throws).
    async logAction(event: ConsoleActionEvent): Promise<void> {
      await sink.record(eventFromAction(event))
      if (delegate) await delegate.logAction(event)
    },
  }
}
