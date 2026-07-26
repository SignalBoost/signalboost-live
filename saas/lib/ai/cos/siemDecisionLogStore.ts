// saas/lib/ai/cos/siemDecisionLogStore.ts
//
// Reference bridge: ship the COS decision/audit trail to a buyer's SIEM through the
// shared portable-audit primitive, with ZERO change to the COS engine. The COS only
// knows the DecisionLogStore port (see decisionStore.ts / decisionLog.ts); it never
// knows a SIEM exists. A buyer constructs this and passes it as the `store` argument
// to the decision-log functions — optionally teeing to their own datastore adapter
// (e.g. createSupabaseDecisionLogStore) so the SIEM export and a queryable ledger
// both happen.
//
// This is the reference implementation of enterprise checklist item #6 (SIEM/audit
// export) for the Chief-of-Staff portable: an immutable, timestamped decision trail
// landing in the buyer's SOC (SOC 2 / ISO 27001 evidence), in ECS-JSON or CEF.

import type {
  CosDecisionStatus,
  DecisionListResult,
  DecisionLogStore,
  DecisionResult,
} from './decisionStore.ts'
import type { CosReasoningOutput } from './reasoningTypes.ts'
import {
  createSiemAuditSink,
  type PortableAuditEvent,
  type SiemAuditSinkConfig,
  type SiemSeverity,
} from '../../../portable-audit/index.ts'

const DATASET = 'cos.decision'

// Event-type → SOC severity. An action that needs owner approval is the one a SOC
// analyst watches; a proposed action is notable; pure logging/analysis is routine.
const SEVERITY: Record<string, SiemSeverity> = {
  'cos.decision_logged': 'info',
  'cos.decision_proposes_action': 'notice',
  'cos.decision_needs_approval': 'warning',
  'cos.decision_approved': 'notice',
  'cos.decision_rejected': 'warning',
  'cos.decision_executed': 'notice',
  'cos.decision_measured': 'info',
  'cos.decision_outcome': 'info',
}
function severityFor(eventType: string): SiemSeverity {
  return SEVERITY[eventType] ?? 'info'
}

function logEventType(output: CosReasoningOutput): string {
  if (output.executionPlan?.requiredApproval) return 'cos.decision_needs_approval'
  if (output.executionPlan?.proposesAction) return 'cos.decision_proposes_action'
  return 'cos.decision_logged'
}

function eventFromDecision(output: CosReasoningOutput, userId?: string | null): PortableAuditEvent {
  return {
    eventId: output.decisionId,
    eventType: logEventType(output),
    occurredAt: new Date().toISOString(),
    dataset: DATASET,
    category: 'process',
    subjectId: output.decisionId,
    payload: {
      objective: output.analysis?.objective,
      channel: output.decision?.channel,
      confidence: output.decision?.confidence,
      state: output.executionPlan?.state,
      proposesAction: output.executionPlan?.proposesAction,
      requiredApproval: output.executionPlan?.requiredApproval,
      approvalReasons: output.executionPlan?.approvalReasons,
      requiredSource: output.sourceRouting?.requiredSource,
      mustUseTool: output.sourceRouting?.mustUseTool,
      ...(userId ? { userId } : {}),
    },
  }
}

export interface SiemDecisionLogStoreOptions {
  // The buyer's SIEM config (transport + format + product/tenant tags). `severityFor`
  // is supplied internally so COS event types map to the right SOC severity; any
  // `severityFor` on this config is ignored.
  siem: Omit<SiemAuditSinkConfig, 'severityFor'>
  // Optional: also write to another DecisionLogStore (e.g. the platform datastore),
  // so the SIEM export and the queryable ledger both happen. When present, its
  // result is what the COS sees; the SIEM export is fire-and-forget by design.
  delegate?: DecisionLogStore
}

export function createSiemDecisionLogStore(opts: SiemDecisionLogStoreOptions): DecisionLogStore {
  const sink = createSiemAuditSink({
    product: 'ChiefOfStaff',
    ...opts.siem,
    severityFor,
  })
  const delegate = opts.delegate

  return {
    async log(output: CosReasoningOutput, userId?: string | null): Promise<DecisionResult> {
      await sink.record(eventFromDecision(output, userId))
      return delegate ? delegate.log(output, userId) : { ok: true }
    },

    async updateOutcome(
      decisionId: string,
      patch: { status?: CosDecisionStatus; outcome?: Record<string, unknown> },
    ): Promise<DecisionResult> {
      await sink.record({
        eventId: `${decisionId}:${patch.status ?? 'outcome'}`,
        eventType: patch.status ? `cos.decision_${patch.status}` : 'cos.decision_outcome',
        occurredAt: new Date().toISOString(),
        dataset: DATASET,
        category: 'process',
        subjectId: decisionId,
        payload: {
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.outcome ? { outcome: patch.outcome } : {}),
        },
      })
      return delegate ? delegate.updateOutcome(decisionId, patch) : { ok: true }
    },

    async list(o?: { limit?: number; status?: CosDecisionStatus }): Promise<DecisionListResult> {
      return delegate ? delegate.list(o) : { ok: true, rows: [] }
    },
  }
}
