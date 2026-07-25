// saas/agent-gateway/adapters/protocols.ts
// Thin software-protocol adapters. Both normalize into the same AgentRequest contract.

import type { AgentRequest, GatewayOutcome, ProtocolAdapter } from '../types.ts'

export function createMcpAdapter(): ProtocolAdapter {
  return {
    protocolId: 'mcp',
    capabilities: {
      version: '1.0', domain: 'software', operations: ['read', 'write', 'command'],
      mutating: true, safetyHints: ['reversible_internal', 'external_effect', 'unknown'],
      evidence: ['request', 'decision', 'approval', 'result'],
    },
    normalize(raw: unknown): AgentRequest {
      const r = (raw ?? {}) as Record<string, any>
      const params = (r.params ?? {}) as Record<string, any>
      return {
        requestId: String(r.id ?? `mcp_${Date.now()}`), protocol: 'mcp',
        agentId: String(r.agent ?? r.agentId ?? 'unknown-agent'), tenantId: r.tenantId, actor: r.actor,
        action: { kind: 'tool_call', target: String(params.name ?? ''), params: (params.arguments ?? {}) as Record<string, unknown> }, raw,
      }
    },
    denormalize(outcome: GatewayOutcome): unknown {
      return { id: outcome.requestId, result: outcome.ok ? outcome.result : undefined,
        error: outcome.ok ? undefined : { message: outcome.error ?? outcome.reason },
        governance: { verdict: outcome.verdict, consequenceClass: outcome.consequenceClass } }
    },
  }
}

export function createA2aAdapter(): ProtocolAdapter {
  return {
    protocolId: 'a2a',
    capabilities: {
      version: '1.0', domain: 'software', operations: ['delegate', 'read', 'write'],
      mutating: true, safetyHints: ['reversible_internal', 'external_effect', 'unknown'],
      evidence: ['request', 'decision', 'approval', 'result'],
    },
    normalize(raw: unknown): AgentRequest {
      const r = (raw ?? {}) as Record<string, any>
      return {
        requestId: String(r.taskId ?? `a2a_${Date.now()}`), protocol: 'a2a',
        agentId: String(r.from ?? r.agentId ?? 'unknown-agent'), tenantId: r.tenantId, actor: r.actor,
        action: { kind: String(r.kind ?? 'task_delegate'), target: String(r.skill ?? r.capability ?? ''), params: (r.input ?? {}) as Record<string, unknown> }, raw,
      }
    },
    denormalize(outcome: GatewayOutcome): unknown {
      const status = outcome.verdict === 'execute' && outcome.ok ? 'completed'
        : outcome.verdict === 'halt_for_approval' ? 'input-required' : 'failed'
      return { taskId: outcome.requestId, status, artifact: outcome.ok ? outcome.result : undefined,
        governance: { verdict: outcome.verdict, consequenceClass: outcome.consequenceClass } }
    },
  }
}
