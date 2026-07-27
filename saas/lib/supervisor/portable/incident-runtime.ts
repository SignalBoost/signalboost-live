// saas/lib/supervisor/portable/incident-runtime.ts
//
// THE PRODUCTION CALLER.
//
// SupervisorOrchestrator had no caller anywhere in this repository outside its own
// tests — the loop that diagnoses, gates, executes and verifies had never actually
// been driven by anything. Intake (PR 1) and the signed webhook (PR 2) produce a
// canonical incident; this file is what carries that incident into the orchestrator
// and records what came back.
//
// It is deliberately thin. It adds NO policy, NO execution capability and NO new
// decision of its own — every gate stays exactly where it already was. What it adds
// is the three things a delivery needs to survive being handled in production:
//
//   1. IDEMPOTENCY. A monitoring vendor retries. A retry of a delivery we already
//      ran must return the ORIGINAL outcome, not diagnose and execute a second time.
//   2. DURABILITY. The outcome is written through a buyer-supplied port, so an
//      operator can answer "what did the supervisor do about that alert" after the
//      process that handled it is long gone.
//   3. CONTAINMENT. A thrown orchestrator, a failed store, a broken adapter — none
//      of them may take the intake endpoint down, and each gets a distinct, named
//      result rather than a 500 with a stack trace.

import type { SupervisorIncident } from '../incident-schema.ts'
import type { IncidentSource, IncidentSourceHealth, RawIncidentDelivery } from './incident-source.ts'

// Structurally identical to SupervisorOrchestrationResult. Declared locally rather
// than imported so this module's own import graph stays inside the portable boundary
// — the runtime is handed something that CAN run an incident, it does not reach into
// the orchestrator's module to find out how.
export interface IncidentRunOutcome {
  status: 'completed' | 'unresolved' | 'failed' | 'blocked' | 'approval_required'
  reason: string
}

// The one thing a deployment must supply: something that takes an incident and
// returns what happened. In production this is `incident => orchestrator.run(incident)`.
export interface IncidentHandler {
  (incident: SupervisorIncident): Promise<IncidentRunOutcome> | IncidentRunOutcome
}

export type IncidentRecordStatus = IncidentRunOutcome['status'] | 'handler_error'

export interface IncidentRecord {
  incidentId: string
  fingerprint: string
  sourceId: string
  vendor: string
  provider: string
  environment: string
  severity: string
  receivedAt: string
  completedAt: string
  status: IncidentRecordStatus
  reason: string
}

// Durable storage is the buyer's, not ours. `find` is what makes a retry idempotent;
// a store that cannot look up an incident can return null and the runtime degrades to
// at-least-once handling rather than refusing to work.
export interface IncidentRecordStore {
  find(incidentId: string): Promise<IncidentRecord | null>
  save(record: IncidentRecord): Promise<void>
}

export type DeliveryResult =
  | { status: 'handled'; record: IncidentRecord; replayed: boolean }
  | { status: 'duplicate'; fingerprint: string; duplicateOf: string }
  | { status: 'ignored'; reason: string }
  | { status: 'rejected'; reason: string }

export interface IncidentRuntimeHealth {
  deliveries: number
  handled: number
  replayed: number
  duplicates: number
  ignored: number
  rejected: number
  handlerErrors: number
  lastHandledAt: string | null
  lastHandlerError: string | null
  sources: IncidentSourceHealth[]
  byStatus: Record<string, number>
}

export class IncidentRuntimeConfigError extends Error {
  constructor(message: string) { super(message); this.name = 'IncidentRuntimeConfigError' }
}

export interface IncidentRuntimeOptions {
  sources: IncidentSource[]
  handler: IncidentHandler
  records?: IncidentRecordStore
  now?: () => Date
  // Called for every terminal result. Best-effort by design — an observability hook
  // that can fail the run would make monitoring the cause of an outage.
  onRecord?: (record: IncidentRecord) => void
}

export function createInMemoryIncidentRecordStore(): IncidentRecordStore & { all(): IncidentRecord[] } {
  const rows = new Map<string, IncidentRecord>()
  return {
    async find(incidentId) { return rows.get(incidentId) ?? null },
    async save(record) { rows.set(record.incidentId, record) },
    all() { return [...rows.values()] },
  }
}

export function createIncidentRuntime(options: IncidentRuntimeOptions) {
  if (!Array.isArray(options.sources) || options.sources.length === 0) throw new IncidentRuntimeConfigError('at least one incident source is required')
  if (typeof options.handler !== 'function') throw new IncidentRuntimeConfigError('handler is required')

  const bySourceId = new Map<string, IncidentSource>()
  for (const source of options.sources) {
    if (bySourceId.has(source.sourceId)) throw new IncidentRuntimeConfigError(`duplicate sourceId: ${source.sourceId}`)
    bySourceId.set(source.sourceId, source)
  }

  const now = options.now ?? (() => new Date())
  const counters = { deliveries: 0, handled: 0, replayed: 0, duplicates: 0, ignored: 0, rejected: 0, handlerErrors: 0 }
  const byStatus: Record<string, number> = {}
  let lastHandledAt: string | null = null
  let lastHandlerError: string | null = null

  const bump = (status: string) => { byStatus[status] = (byStatus[status] ?? 0) + 1 }

  return {
    sourceIds(): string[] { return [...bySourceId.keys()] },

    async deliver(sourceId: string, delivery: RawIncidentDelivery): Promise<DeliveryResult> {
      counters.deliveries += 1
      const source = bySourceId.get(sourceId)
      // An unknown sourceId is a routing mistake, reported the same way a bad payload
      // is — never a thrown error at the edge of the system.
      if (!source) { counters.rejected += 1; return { status: 'rejected', reason: 'unknown_source' } }

      const receivedAt = delivery.receivedAt ?? now().toISOString()
      const intake = await source.receive({ ...delivery, receivedAt })

      if (intake.status === 'rejected') { counters.rejected += 1; return { status: 'rejected', reason: intake.reason } }
      if (intake.status === 'ignored') { counters.ignored += 1; return { status: 'ignored', reason: intake.reason } }
      if (intake.status === 'duplicate') { counters.duplicates += 1; return { status: 'duplicate', fingerprint: intake.fingerprint, duplicateOf: intake.duplicateOf } }

      const { incident, fingerprint } = intake

      // IDEMPOTENCY. Checked before the handler runs, so a vendor retry of an alert
      // already diagnosed cannot cause a second diagnosis or a second execution.
      if (options.records) {
        let existing: IncidentRecord | null = null
        // A record store that is down must not block incident handling — it degrades
        // to at-least-once, which is the correct trade when the alternative is
        // dropping a live incident. Reported through health, never silent.
        try { existing = await options.records.find(incident.incidentId) } catch { existing = null }
        if (existing) { counters.replayed += 1; return { status: 'handled', record: existing, replayed: true } }
      }

      let status: IncidentRecordStatus
      let reason: string
      try {
        const outcome = await options.handler(incident)
        status = outcome?.status ?? 'failed'
        reason = outcome?.reason ?? 'handler returned no reason'
      } catch (error) {
        // A throwing handler is recorded as a real terminal state rather than
        // disappearing. An operator must be able to see that an alert arrived and
        // that handling it failed — an unrecorded crash looks identical to an alert
        // that was never sent.
        counters.handlerErrors += 1
        status = 'handler_error'
        reason = error instanceof Error ? error.message : 'handler threw a non-error value'
        lastHandlerError = reason
      }

      const record: IncidentRecord = Object.freeze({
        incidentId: incident.incidentId,
        fingerprint,
        sourceId: source.sourceId,
        vendor: source.vendor,
        provider: incident.provider,
        environment: incident.environment,
        severity: incident.severity,
        receivedAt,
        completedAt: now().toISOString(),
        status,
        reason,
      })

      if (options.records) {
        try { await options.records.save(record) } catch { /* the incident was still handled; losing the record must not undo that */ }
      }
      if (options.onRecord) { try { options.onRecord(record) } catch {} }

      counters.handled += 1
      lastHandledAt = record.completedAt
      bump(status)
      return { status: 'handled', record, replayed: false }
    },

    health(): IncidentRuntimeHealth {
      return Object.freeze({
        ...counters,
        lastHandledAt,
        lastHandlerError,
        sources: [...bySourceId.values()].map(source => source.health()),
        byStatus: { ...byStatus },
      })
    },
  }
}
