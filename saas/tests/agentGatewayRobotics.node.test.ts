// saas/tests/agentGatewayRobotics.node.test.ts
//
// Proof that the governed socket spans PHYSICAL agents. Four protocols now register
// concurrently (mcp, a2a, mavlink, ros2). A drone/robot command normalizes into the same
// AgentRequest as a software tool call and hits the same governance core — so the safety
// envelope governs machines exactly as it governs agents. The headline assertion: a command
// that moves a machine into the world (land at a site, fly a new waypoint) is CATEGORICALLY
// halted for a human even if someone allowlisted it, while a known-safe reversible recovery
// (return-to-launch) or a read-only telemetry request can run unattended.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ProtocolRegistry, runGoverned, evaluate,
  createMcpAdapter, createA2aAdapter, createMavlinkAdapter, createRos2Adapter,
  type AgentRequest, type ConsequenceClass, type GovernancePolicy, type GatewayHost, type PortableAuditEvent, type PortableAuditSink,
} from '../agent-gateway/index.ts'

// Example robotics classifier: physical motion into the world = safety (human-only);
// return-to-base and read-only telemetry = reversible_internal.
const classifier = {
  classify(req: AgentRequest): ConsequenceClass {
    const t = req.action.target
    if (/^(REQUEST_TELEMETRY|REQUEST_MESSAGE|SET_MESSAGE_INTERVAL|get_status)$/.test(t)) return 'reversible_internal'
    if (/^(RETURN_TO_LAUNCH|return_to_dock)$/.test(t)) return 'reversible_internal'
    if (/^(NAV_LAND|NAV_TAKEOFF|NAV_WAYPOINT|DO_SET_MODE|DO_SET_SERVO|navigate_to_pose|dock|release_payload)$/.test(t)) return 'safety'
    return 'unknown'
  },
}
const policy: GovernancePolicy = {
  classifier, tenantId: 'acme', environment: 'prod',
  allowlist: [
    { actionKind: 'robot_command', target: 'RETURN_TO_LAUNCH', rollback: 'abort RTL → loiter/hold at current position' },
    { actionKind: 'robot_command', target: 'REQUEST_TELEMETRY', rollback: 'read-only; nothing to roll back' },
    // DELIBERATELY allowlisting a physical-motion command — the safety gate must STILL halt it.
    { actionKind: 'robot_command', target: 'NAV_LAND', rollback: 'abort landing → climb to safe altitude' },
  ],
}

function buyerHost() {
  const performed: AgentRequest[] = []
  const events: PortableAuditEvent[] = []
  const audit: PortableAuditSink = { async record(e) { events.push(e) } }
  const host: GatewayHost = {
    execution: { async perform(req) { performed.push(req); return { ok: true, result: `commanded ${req.action.target}` } } },
    approvals: { async requestApproval(req) { return { approvalId: `appr_${req.requestId}` } } },
    audit,
  }
  return { host, performed, events }
}
function registry() {
  const r = new ProtocolRegistry()
  r.register(createMcpAdapter()); r.register(createA2aAdapter())
  r.register(createMavlinkAdapter()); r.register(createRos2Adapter())
  return r
}

test('FOUR protocols run concurrently in one registry (software + physical)', () => {
  assert.deepEqual(registry().list().sort(), ['a2a', 'mavlink', 'mcp', 'ros2'])
})

test('a known-safe reversible recovery (RETURN_TO_LAUNCH via MAVLink) executes', async () => {
  const r = registry(); const { host, performed, events } = buyerHost()
  const req = r.normalize('mavlink', { id: 'd1', system_id: 7, command: 'RETURN_TO_LAUNCH', params: {} })
  const out = await runGoverned(req, policy, host)
  assert.equal(out.verdict, 'execute')
  assert.equal(performed.length, 1)
  assert.equal(req.agentId, 'sysid:7')
  assert.ok(events.some((e) => e.eventType === 'agent.executed'))
})

test('a physical-motion command (NAV_LAND) is CATEGORICALLY halted for a human — even though it is allowlisted', async () => {
  const r = registry(); const { host, performed } = buyerHost()
  const req = r.normalize('mavlink', { id: 'd2', system_id: 7, command: 'NAV_LAND', params: { lat: 40.1, lon: -74.0 } })
  const decision = evaluate(req, policy)
  assert.equal(decision.consequenceClass, 'safety')
  assert.equal(decision.verdict, 'halt_for_approval')   // safety gate beats the allowlist
  const out = await runGoverned(req, policy, host)
  assert.equal(out.verdict, 'halt_for_approval')
  assert.equal(performed.length, 0)                     // the drone did NOT land
})

test('an unlisted maneuver (NAV_WAYPOINT) halts as safety', () => {
  const r = registry()
  const req = r.normalize('mavlink', { id: 'd3', system_id: 7, command: 'NAV_WAYPOINT', params: {} })
  assert.equal(evaluate(req, policy).verdict, 'halt_for_approval')
})

test('read-only telemetry (REQUEST_TELEMETRY) runs unattended', () => {
  const r = registry()
  const req = r.normalize('mavlink', { id: 'd4', system_id: 7, command: 'REQUEST_TELEMETRY', params: {} })
  assert.equal(evaluate(req, policy).verdict, 'execute')
})

test('portability across ROBOTICS protocols: same command, same verdict via MAVLink and ROS 2', () => {
  const r = registry()
  const viaMav = r.normalize('mavlink', { id: 'm', system_id: 3, command: 'RETURN_TO_LAUNCH' })
  const viaRos = r.normalize('ros2', { goalId: 'g', robotId: 'amr-3', action: 'RETURN_TO_LAUNCH', goal: {} })
  assert.deepEqual(viaMav.action, viaRos.action)                    // identical normalized action
  assert.equal(evaluate(viaMav, policy).verdict, 'execute')
  assert.equal(evaluate(viaRos, policy).verdict, 'execute')
  // and a ground-robot dock maneuver (physical motion) halts, same as a drone landing
  const dock = r.normalize('ros2', { goalId: 'g2', robotId: 'amr-3', action: 'navigate_to_pose', goal: { x: 5 } })
  assert.equal(evaluate(dock, policy).verdict, 'halt_for_approval')
})

test('outcomes denormalize into each robot protocol\'s own ack/result envelope', async () => {
  const r = registry(); const { host } = buyerHost()
  const out = await runGoverned(r.normalize('mavlink', { id: 'd9', system_id: 1, command: 'RETURN_TO_LAUNCH' }), policy, host)
  assert.equal((r.denormalize('mavlink', out) as any).result, 'MAV_RESULT_ACCEPTED')
  const halted = await runGoverned(r.normalize('ros2', { goalId: 'g9', robotId: 'amr-1', action: 'navigate_to_pose', goal: {} }), policy, host)
  assert.equal((r.denormalize('ros2', halted) as any).status, 'PENDING_APPROVAL')
})
