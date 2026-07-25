// saas/agent-gateway/adapters/industrial.ts
// Supervisory industrial adapters. PLC scan cycles, deterministic fieldbus timing, interlocks,
// emergency stops, actuator timing, and certified safety logic remain on plant controllers.

import type { AgentRequest, GatewayOutcome, ProtocolAdapter } from '../types.ts'

export function createOpcUaAdapter(): ProtocolAdapter {
  return {
    protocolId: 'opcua',
    capabilities: {
      version: '1.0', domain: 'industrial', operations: ['read', 'write', 'command', 'subscribe'], mutating: true,
      safetyHints: ['reversible_internal', 'external_effect', 'safety', 'unknown'],
      evidence: ['request', 'decision', 'approval', 'result', 'telemetry'], supervisoryOnly: true,
    },
    normalize(raw: unknown): AgentRequest {
      const r = (raw ?? {}) as Record<string, any>
      const operation = String(r.operation ?? r.method ?? r.action ?? '')
      const target = String(r.nodeId ?? r.objectId ?? r.target ?? '')
      return {
        requestId: String(r.requestId ?? r.id ?? `opcua_${Date.now()}`), protocol: 'opcua',
        agentId: String(r.endpointId ?? r.serverId ?? 'unknown-opcua-server'), tenantId: r.tenantId, actor: r.actor,
        action: { kind: 'industrial_command', target: operation ? `${operation}:${target}` : target,
          params: (r.inputArguments ?? r.value ?? r.params ?? {}) as Record<string, unknown> }, raw,
      }
    },
    denormalize(outcome: GatewayOutcome): unknown {
      const statusCode = outcome.verdict === 'execute' && outcome.ok ? 'Good'
        : outcome.verdict === 'halt_for_approval' ? 'BadWouldBlock' : 'BadUserAccessDenied'
      return { requestId: outcome.requestId, statusCode,
        governance: { verdict: outcome.verdict, consequenceClass: outcome.consequenceClass } }
    },
  }
}

export function createMqttAdapter(): ProtocolAdapter {
  return {
    protocolId: 'mqtt',
    capabilities: {
      version: '1.0', domain: 'industrial', operations: ['publish', 'subscribe', 'read', 'command'], mutating: true,
      safetyHints: ['reversible_internal', 'external_effect', 'safety', 'unknown'],
      evidence: ['request', 'decision', 'approval', 'result', 'telemetry'], supervisoryOnly: true,
    },
    normalize(raw: unknown): AgentRequest {
      const r = (raw ?? {}) as Record<string, any>
      return {
        requestId: String(r.messageId ?? r.id ?? `mqtt_${Date.now()}`), protocol: 'mqtt',
        agentId: String(r.clientId ?? r.deviceId ?? 'unknown-mqtt-client'), tenantId: r.tenantId, actor: r.actor,
        action: { kind: 'industrial_command', target: String(r.topic ?? ''), params: (r.payload ?? {}) as Record<string, unknown> }, raw,
      }
    },
    denormalize(outcome: GatewayOutcome): unknown {
      const status = outcome.verdict === 'execute' && outcome.ok ? 'accepted'
        : outcome.verdict === 'halt_for_approval' ? 'pending_approval' : 'rejected'
      return { requestId: outcome.requestId, status,
        governance: { verdict: outcome.verdict, consequenceClass: outcome.consequenceClass } }
    },
  }
}
