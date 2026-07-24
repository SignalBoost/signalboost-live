// saas/agent-gateway/adapters/protocols.ts
//
// The first two protocol adapters. They are deliberately thin: each only translates its
// wire format into the shared AgentRequest and back. Note that MCP and A2A produce the
// SAME internal shape — which is the whole point: the governance core treats them
// identically, and a third, fourth, or Nth protocol is just another adapter here.

import type { AgentRequest, GatewayOutcome, ProtocolAdapter } from '../types.ts'

// MCP (Model Context Protocol) — the agent-to-tool standard. A tool call looks like a
// JSON-RPC-ish envelope: { id, method: 'tools/call', params: { name, arguments }, agent }.
export function createMcpAdapter(): ProtocolAdapter {
  return {
    protocolId: 'mcp',
    normalize(raw: unknown): AgentRequest {
      const r = (raw ?? {}) as Record<string, any>
      const params = (r.params ?? {}) as Record<string, any>
      return {
        requestId: String(r.id ?? `mcp_${Date.now()}`),
        protocol: 'mcp',
        agentId: String(r.agent ?? r.agentId ?? 'unknown-agent'),
        tenantId: r.tenantId,
        actor: r.actor,
        action: { kind: 'tool_call', target: String(params.name ?? ''), params: (params.arguments ?? {}) as Record<string, unknown> },
        raw,
      }
    },
    denormalize(outcome: GatewayOutcome): unknown {
      return {
        id: outcome.requestId,
        result: outcome.ok ? outcome.result : undefined,
        error: outcome.ok ? undefined : { message: outcome.error ?? outcome.reason },
        governance: { verdict: outcome.verdict, consequenceClass: outcome.consequenceClass },
      }
    },
  }
}

// A2A (Agent-to-Agent) — the agent-to-agent coordination standard. A task looks like:
// { taskId, from, skill, input, tenantId }.
export function createA2aAdapter(): ProtocolAdapter {
  return {
    protocolId: 'a2a',
    normalize(raw: unknown): AgentRequest {
      const r = (raw ?? {}) as Record<string, any>
      return {
        requestId: String(r.taskId ?? `a2a_${Date.now()}`),
        protocol: 'a2a',
        agentId: String(r.from ?? r.agentId ?? 'unknown-agent'),
        tenantId: r.tenantId,
        actor: r.actor,
        action: { kind: String(r.kind ?? 'task_delegate'), target: String(r.skill ?? r.capability ?? ''), params: (r.input ?? {}) as Record<string, unknown> },
        raw,
      }
    },
    denormalize(outcome: GatewayOutcome): unknown {
      const status = outcome.verdict === 'execute' && outcome.ok ? 'completed'
        : outcome.verdict === 'halt_for_approval' ? 'input-required'
        : 'failed'
      return {
        taskId: outcome.requestId,
        status,
        artifact: outcome.ok ? outcome.result : undefined,
        governance: { verdict: outcome.verdict, consequenceClass: outcome.consequenceClass },
      }
    },
  }
}
