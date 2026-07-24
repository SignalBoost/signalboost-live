// saas/agent-gateway/adapters/robotics.ts
//
// Physical-agent protocol adapters — proof that the governed socket spans software agents
// AND commanded machines with ZERO change to the core. A robot command normalizes into the
// exact same AgentRequest an MCP tool call does, so the same safety envelope governs it.
//
// SCOPE: these adapters sit at the SUPERVISORY / command layer (dispatch, authorize, enable
// a maneuver) — NOT the real-time flight-control loop (stabilization, collision avoidance),
// which stays on the autopilot with its own hard real-time and safety guarantees.

import type { AgentRequest, GatewayOutcome, ProtocolAdapter } from '../types.ts'

// MAVLink (drones) — a command looks like a COMMAND_LONG/mission item:
// { command: 'NAV_LAND', system_id, component_id?, params: {...} }.
export function createMavlinkAdapter(): ProtocolAdapter {
  return {
    protocolId: 'mavlink',
    normalize(raw: unknown): AgentRequest {
      const r = (raw ?? {}) as Record<string, any>
      return {
        requestId: String(r.id ?? r.seq ?? `mavlink_${Date.now()}`),
        protocol: 'mavlink',
        agentId: `sysid:${r.system_id ?? r.systemId ?? 'unknown'}`,
        tenantId: r.tenantId,
        actor: r.actor,
        action: { kind: 'robot_command', target: String(r.command ?? ''), params: (r.params ?? {}) as Record<string, unknown> },
        raw,
      }
    },
    denormalize(outcome: GatewayOutcome): unknown {
      // MAVLink COMMAND_ACK-style envelope: ACCEPTED only on a governed execute.
      const result = outcome.verdict === 'execute' && outcome.ok ? 'MAV_RESULT_ACCEPTED'
        : outcome.verdict === 'halt_for_approval' ? 'MAV_RESULT_TEMPORARILY_REJECTED'
        : 'MAV_RESULT_DENIED'
      return { requestId: outcome.requestId, result, governance: { verdict: outcome.verdict, consequenceClass: outcome.consequenceClass } }
    },
  }
}

// ROS 2 (ground robots / arms / AVs) — a command looks like an action/topic goal:
// { robotId, action: 'navigate_to_pose', goal: {...} } over DDS.
export function createRos2Adapter(): ProtocolAdapter {
  return {
    protocolId: 'ros2',
    normalize(raw: unknown): AgentRequest {
      const r = (raw ?? {}) as Record<string, any>
      return {
        requestId: String(r.goalId ?? r.id ?? `ros2_${Date.now()}`),
        protocol: 'ros2',
        agentId: String(r.robotId ?? r.node ?? 'unknown-robot'),
        tenantId: r.tenantId,
        actor: r.actor,
        action: { kind: 'robot_command', target: String(r.action ?? r.topic ?? ''), params: (r.goal ?? r.msg ?? {}) as Record<string, unknown> },
        raw,
      }
    },
    denormalize(outcome: GatewayOutcome): unknown {
      // ROS 2 action-result style: SUCCEEDED / ABORTED, plus governance provenance.
      const status = outcome.verdict === 'execute' && outcome.ok ? 'SUCCEEDED'
        : outcome.verdict === 'halt_for_approval' ? 'PENDING_APPROVAL'
        : 'ABORTED'
      return { goalId: outcome.requestId, status, governance: { verdict: outcome.verdict, consequenceClass: outcome.consequenceClass } }
    },
  }
}
