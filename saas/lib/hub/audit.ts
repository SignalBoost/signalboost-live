// saas/lib/hub/audit.ts
//
// Unified audit adapter — the SINGLE sink for Hub Console audit events.
//
// Every action execution, permission decision, and sensitive operation routes
// through recordAuditEvent(). To forward audit events to your own system
// (a different table, an external SIEM, Datadog, a webhook, etc.), replace the
// body of writeAuditSink() below — every caller already goes through it, so you
// change ONE function instead of editing the whole codebase. This is the
// portability seam a host platform overrides.
//
// Canonical table — create once in Supabase:
//
//   create table if not exists hub_audit_log (
//     id          bigint generated always as identity primary key,
//     created_at  timestamptz not null default now(),
//     actor       text,
//     action      text not null,
//     status      text not null,
//     target      text,
//     message     text,
//     metadata    jsonb,
//     ip          text
//   );
//   alter table hub_audit_log enable row level security;
//   -- (add an owner/admin read policy as appropriate for your deployment)

import { createClient } from '@supabase/supabase-js'

export type AuditStatus =
  | 'success'
  | 'failure'
  | 'blocked'
  | 'denied'
  | 'error'
  | 'config_error'

export interface AuditEvent {
  /** Who performed (or attempted) the action: user id or email. */
  actor: string
  /** What was attempted: template id, permission name, or operation key. */
  action: string
  status: AuditStatus
  /** Optional resource/provider affected (e.g. "stripe", a route path). */
  target?: string
  message?: string
  /** Any JSON-serializable structured detail. */
  metadata?: unknown
  /** Requesting IP, when available. */
  ip?: string
}

const AUDIT_TABLE = 'hub_audit_log'

/** Normalize the legacy uppercase status strings used by older call sites. */
export function normalizeStatus(s: string): AuditStatus {
  const v = String(s || '').toLowerCase()
  if (v === 'success') return 'success'
  if (v === 'failure' || v === 'fail') return 'failure'
  if (v === 'blocked') return 'blocked'
  if (v === 'denied') return 'denied'
  if (v === 'config_error') return 'config_error'
  return 'error'
}

/**
 * Record an audit event. Fail-safe by contract: this NEVER throws and NEVER
 * blocks the operation it is recording. If the sink is unavailable, the event
 * is dropped rather than breaking the request.
 */
export async function recordAuditEvent(event: AuditEvent): Promise<void> {
  try {
    await writeAuditSink(event)
  } catch {
    // Audit must never break the operation it records.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// THE SWAP POINT. Replace this body to send audit events to your own sink.
// ─────────────────────────────────────────────────────────────────────────────
async function writeAuditSink(event: AuditEvent): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return

  const supabase = createClient(url, key)
  await supabase.from(AUDIT_TABLE).insert({
    actor: event.actor || 'unknown',
    action: event.action,
    status: event.status,
    target: event.target || null,
    message: event.message || null,
    metadata: event.metadata != null ? JSON.stringify(event.metadata) : null,
    ip: event.ip || null,
  })
}
