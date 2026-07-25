// saas/agent-gateway/types.ts
//
// The GOVERNED SOCKET — bring-your-own agent, protocol, model, and tool, made portable
// and safe. Every wire protocol normalizes into one internal request and passes through
// one governance core. Protocol and vendor details remain at the registered adapter edge.

import type { PortableAuditEvent, PortableAuditSink } from '../portable-audit/index.ts'
export type { PortableAuditEvent, PortableAuditSink }

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
  kind: string
  target: string
  params?: Record<string, unknown>
}

export type ProtocolDomain = 'software' | 'robotics' | 'industrial' | 'transport' | 'other'
export type ProtocolOperationMode = 'read' | 'write' | 'command' | 'delegate' | 'publish' | 'subscribe'
export type ProtocolSafetyHint = 'reversible_internal' | 'external_effect' | 'safety' | 'unknown'

export interface ProtocolCapabilityMetadata {
  version: string
  domain: ProtocolDomain
  operations: readonly ProtocolOperationMode[]
  mutating: boolean
  safetyHints: readonly ProtocolSafetyHint[]
  evidence: readonly ('request' | 'decision' | 'approval' | 'result' | 'telemetry')[]
  supervisoryOnly?: boolean
}

export interface ProtocolAdapter {
  protocolId: string
  capabilities: ProtocolCapabilityMetadata
  normalize(raw: unknown): AgentRequest
  denormalize(outcome: GatewayOutcome): unknown
}

export type ConsequenceClass =
  | 'reversible_internal'
  | 'financial'
  | 'safety'
  | 'data_destructive'
  | 'external_effect'
  | 'unknown'

export const HUMAN_ONLY_CLASSES: readonly ConsequenceClass[] = [
  'financial', 'safety', 'data_destructive', 'external_effect', 'unknown',
]

export interface ConsequenceClassifier {
  classify(request: AgentRequest): ConsequenceClass
}

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
