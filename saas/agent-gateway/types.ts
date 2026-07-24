// saas/agent-gateway/types.ts
//
// The GOVERNED SOCKET — bring-your-own agent, protocol, model, and tool, made portable
// and safe. A buyer keeps whatever platform they run (Microsoft, Salesforce, OpenAI,
// Anthropic, Google, LangChain, CrewAI, an in-house agent) and plugs it in through a
// protocol adapter. Every request, whatever protocol it arrived on, is normalized to ONE
// internal shape and passed through ONE governance core. The core never learns any
// protocol or vendor name — those live only at the edge as registered adapters, so a new
// protocol (or five) is a plugin, never a rewrite.
//
// Host-agnostic by construction: this module names no platform, reads no environment, and
// holds no credentials. The buyer brings execution, approvals, and their SIEM.

import type { PortableAuditEvent, PortableAuditSink } from '../portable-audit/index.ts'
export type { PortableAuditEvent, PortableAuditSink }

// The normalized internal request. EVERY protocol adapter produces this; the governance
// core only ever sees this. `protocol` is a provenance label for the audit trail — the
// core does NOT branch on it.
export interface AgentRequest {
  requestId: string
  protocol: string
  agentId: string
  tenantId?: string
  actor?: { userId?: string; roles?: string[] }
  action: AgentAction
  raw?: unknown
}

export interface AgentAction {
  kind: string      // e.g. 'tool_call', 'task_delegate', 'provider_action'
  target: string    // the tool / capability / provider being invoked
  params?: Record<string, unknown>
}

// A protocol adapter translates a wire format <-> the normalized request. Many are
// registered and run CONCURRENTLY; adding one never touches the core or the others.
export interface ProtocolAdapter {
  protocolId: string
  normalize(raw: unknown): AgentRequest
  denormalize(outcome: GatewayOutcome): unknown
}

// ---- Consequence classification: the safety interlock ----
// A closed set of consequence classes. Only 'reversible_internal' is EVER eligible for
// unattended execution. The rest are categorically human-gated and can never be
// pre-authorized — no confidence score can override this.
export type ConsequenceClass =
  | 'reversible_internal' // restart worker, rollback deploy, clear cache, re-run idempotent job
  | 'financial'           // money movement, spend, billing, payouts
  | 'safety'              // life / health / physical-world impact
  | 'data_destructive'    // deletes or overwrites customer data
  | 'external_effect'     // sends / publishes / acts on the outside world
  | 'unknown'             // unclassified -> treated as human-only, fail closed

// Classes that ALWAYS require a human and can never be pre-authorized (the hard rule).
export const HUMAN_ONLY_CLASSES: readonly ConsequenceClass[] = [
  'financial', 'safety', 'data_destructive', 'external_effect', 'unknown',
]

export interface ConsequenceClassifier {
  classify(request: AgentRequest): ConsequenceClass
}

// ---- Closed allowlist of pre-authorized reversible actions ----
// Each entry names an (actionKind, target) pair and REQUIRES a verified rollback. Nothing
// absent from this list is ever eligible for unattended execution.
export interface AllowlistEntry {
  actionKind: string
  target: string
  rollback: string
}

export interface GovernancePolicy {
  classifier: ConsequenceClassifier
  allowlist: readonly AllowlistEntry[]
  tenantId?: string
  environment?: string
}

export type GovernanceVerdict = 'execute' | 'halt_for_approval' | 'deny'

export interface GovernanceDecision {
  requestId: string
  verdict: GovernanceVerdict
  consequenceClass: ConsequenceClass
  reason: string
}

// ---- Buyer-supplied host: execution, approvals, audit ----
export interface ExecutionPort {
  perform(request: AgentRequest): Promise<{ ok: boolean; result?: unknown; error?: string }>
}
export interface ApprovalPort {
  requestApproval(request: AgentRequest, decision: GovernanceDecision): Promise<{ approvalId: string }>
}
export interface GatewayHost {
  execution: ExecutionPort
  approvals?: ApprovalPort
  audit?: PortableAuditSink
}

export interface GatewayOutcome {
  requestId: string
  verdict: GovernanceVerdict
  consequenceClass: ConsequenceClass
  ok: boolean
  result?: unknown
  approvalId?: string
  error?: string
  reason: string
}
