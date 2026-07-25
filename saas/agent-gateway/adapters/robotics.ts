// saas/agent-gateway/adapters/robotics.ts
// Supervisory physical-agent adapters. Real-time stabilization, collision avoidance, actuator
// timing, and hard safety remain on the robot controller or autopilot.

import type { AgentRequest, GatewayOutcome, ProtocolAdapter } from '../types.ts'

export function createMavlinkAdapter(): ProtocolAdapter {
  return {
    protocolId: 'mavlink',
    capabilities: {
      version: '1.0', domain: 'robotics', operations: ['read', 'command'], mutating: true,
      safetyHints: ['reversible_internal', 'safety', 'unknown'],
      evidence: ['request', 'decision', 'approval', 'result', 'telemetry'], supervisoryOnly: true,
    },
    normalize(raw: unknown): AgentRequest {
      const r = (raw ?? {}) as Record<string, any>
      return {
        requestId: String(r.id ?? r.seq ?? `mavlink_${Date.now()}`), protocol: 'mavlink',
        agentId: `sysid:${r.system_id ?? r.systemId ?? 'unknown'}`, tenantId: r.tenantId, actor: r.actor,
        action: { kind: 'robot_command', target: String(r.command ?? ''), params: (r.params ?? {}) as Record<string, unknown> }, raw,
      }
    },
    denormalize(outcome: GatewayOutcome): unknown {
      const result = outcome.verdict === 'execute' && outcome.ok ? 'MAV_RESULT_ACCEPTED'
        : outcome.verdict === 'halt_for_approval' ? 'MAV_RESULT_TEMPORARILY_REJECTED' : 'MAV_RESULT_DENIED'
      return { requestId: outcome.requestId, result,
        governance: { verdict: outcome.verdict, consequenceClass: outcome.consequenceClass } }
    },
  }
}

export function createRos2Adapter(): ProtocolAdapter {
  return {
    protocolId: 'ros2',
    capabilities: {
      version: '1.0', domain: 'robotics', operations: ['read', 'publish', 'subscribe', 'command'], mutating: true,
      safetyHints: ['reversible_internal', 'safety', 'unknown'],
      evidence: ['request', 'decision', 'approval', 'result', 'telemetry'], supervisoryOnly: true,
    },
    normalize(raw: unknown): AgentRequest {
      const r = (raw ?? {}) as Record<string, any>
      return {
        requestId: String(r.goalId ?? r.id ?? `ros2_${Date.now()}`), protocol: 'ros2',
        agentId: String(r.robotId ?? r.node ?? 'unknown-robot'), tenantId: r.tenantId, actor: r.actor,
        action: { kind: 'robot_command', target: String(r.action ?? r.topic ?? ''), params: (r.goal ?? r.msg ?? {}) as Record<string, unknown> }, raw,
      }
    },
    denormalize(outcome: GatewayOutcome): unknown {
      const status = outcome.verdict === 'execute' && outcome.ok ? 'SUCCEEDED'
        : outcome.verdict === 'halt_for_approval' ? 'PENDING_APPROVAL' : 'ABORTED'
      return { goalId: outcome.requestId, status,
        governance: { verdict: outcome.verdict, consequenceClass: outcome.consequenceClass } }
    },
  }
}
