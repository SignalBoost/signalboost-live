// saas/tests/agentGateway.node.test.ts
//
// END-TO-END proof of the governed socket. A buyer registers THREE protocols (MCP + A2A +
// MAVLink) concurrently, brings their own execution + approval + SIEM, and every request —
// whatever protocol it arrived on — flows through ONE governance core. Asserts: reversible
// allowlisted actions execute; anything touching money/data/safety is categorically halted for
// a human EVEN IF someone allowlisted it; unlisted actions default-halt; the SAME action gets
// the SAME verdict across protocols (portability across software and physical agents); unknown
// protocols fail closed; and every outcome is audited. No SignalBoost infrastructure.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ProtocolRegistry,
  runGoverned,
  evaluate,
  createMcpAdapter,
  createA2aAdapter,
  createMavlinkAdapter,
  type AgentRequest,
  type ConsequenceClass,
  type GovernancePolicy,
  type GatewayHost,
  type PortableAuditEvent,
  type PortableAuditSink,
} from '../agent-gateway/index.ts'

// An example buyer consequence classifier (the real one is buyer/policy-supplied).
const classifier = {
  classify(req: AgentRequest): ConsequenceClass {
    const t = req.action.target
    if (/^(restart-|rollback-|clear-cache|rerun-)/.test(t)) return 'reversible_internal'
    if (/(refund|charge|payout|invoice|payment)/.test(t)) return 'financial'
    if (/(delete|drop|purge)/.test(t)) return 'data_destructive'
    if (/(land|takeoff|waypoint|navigate|steer|brake|throttle|thrust|altitude|arm|disarm|motor|servo|actuator|payload)/i.test(t)) return 'safety'
    if (/(send|publish|email|post)/.test(t)) return 'external_effect'
    return 'unknown'
  },
}
const policy: GovernancePolicy = {
  classifier,
  tenantId: 'acme',
  environment: 'prod',
  allowlist: [
    { actionKind: 'tool_call', target: 'restart-worker', rollback: 'idempotent restart, no state change' },
    // DELIBERATELY allowlisting a financial action — the categorical gate must STILL halt it.
    { actionKind: 'tool_call', target: 'issue-refund', rollback: 'reverse the refund' },
  ],
}

function buyerHost() {
  const performed: AgentRequest[] = []
  const approvals: { requestId: string }[] = []
  const events: PortableAuditEvent[] = []
  const audit: PortableAuditSink = { async record(e) { events.push(e) } }
  const host: GatewayHost = {
    execution: { async perform(req) { performed.push(req); return { ok: true, result: `did ${req.action.target}` } } },
    approvals: { async requestApproval(req) { approvals.push({ requestId: req.requestId }); return { approvalId: `appr_${req.requestId}` } } },
    audit,
  }
  return { host, performed, approvals, events }
}

function registry() {
  const r = new ProtocolRegistry()
  r.register(createMcpAdapter())
  r.register(createA2aAdapter())
  r.register(createMavlinkAdapter())
  return r
}

test('software and physical-agent protocols run concurrently; unknown protocol + double-register fail closed', () => {
  const r = registry()
  assert.deepEqual(r.list().sort(), ['a2a', 'mavlink', 'mcp'])
  assert.throws(() => r.normalize('grpc-x', {}), /no adapter registered/)
  assert.throws(() => r.register(createMcpAdapter()), /already registered/)
})

test('an allowlisted reversible action (via MCP) executes and audits as a notice', async () => {
  const r = registry()
  const { host, performed, events } = buyerHost()
  const req = r.normalize('mcp', { id: 'r1', agent: 'ops-bot', params: { name: 'restart-worker', arguments: { id: 'w7' } } })
  const out = await runGoverned(req, policy, host)
  assert.equal(out.verdict, 'execute')
  assert.equal(out.ok, true)
  assert.equal(performed.length, 1)
  const ev = events.find((e) => e.eventType === 'agent.executed')
  assert.ok(ev)
  assert.equal(ev!.payload!.consequenceClass, 'reversible_internal')
  assert.equal(ev!.payload!.protocol, 'mcp')
})

test('a FINANCIAL action is categorically halted for a human — even though it is in the allowlist', async () => {
  const r = registry()
  const { host, performed, approvals, events } = buyerHost()
  const req = r.normalize('mcp', { id: 'r2', agent: 'ops-bot', params: { name: 'issue-refund', arguments: { amount: 500 } } })
  const decision = evaluate(req, policy)
  assert.equal(decision.consequenceClass, 'financial')
  assert.equal(decision.verdict, 'halt_for_approval')       // Gate 1 wins over the allowlist
  const out = await runGoverned(req, policy, host)
  assert.equal(out.verdict, 'halt_for_approval')
  assert.equal(performed.length, 0)                          // nothing executed
  assert.equal(approvals.length, 1)                          // parked for a human
  assert.ok(events.some((e) => e.eventType === 'agent.halted_for_approval'))
})

test('an unlisted reversible action default-halts', async () => {
  const r = registry()
  const { host, performed } = buyerHost()
  const req = r.normalize('mcp', { id: 'r3', agent: 'ops-bot', params: { name: 'clear-cache', arguments: {} } })
  const out = await runGoverned(req, policy, host)
  assert.equal(out.consequenceClass, 'reversible_internal')
  assert.equal(out.verdict, 'halt_for_approval')             // reversible, but not on the list
  assert.equal(performed.length, 0)
})

test('an unclassifiable action fails closed to human approval', async () => {
  const req = { requestId: 'r4', protocol: 'mcp', agentId: 'x', action: { kind: 'tool_call', target: 'do-something-weird' } } as AgentRequest
  assert.equal(evaluate(req, policy).verdict, 'halt_for_approval')
  assert.equal(evaluate(req, policy).consequenceClass, 'unknown')
})

test('the SAME action gets the SAME verdict via MCP and via A2A (portability across protocols)', async () => {
  const r = registry()
  const mcpReq = r.normalize('mcp', { id: 'm', agent: 'bot', params: { name: 'restart-worker', arguments: { id: 'w1' } } })
  const a2aReq = r.normalize('a2a', { taskId: 't', from: 'bot', kind: 'tool_call', skill: 'restart-worker', input: { id: 'w1' } })
  // Both normalize to the same internal action ...
  assert.deepEqual(mcpReq.action, a2aReq.action)
  // ... so the core, which never sees the protocol, decides identically.
  assert.equal(evaluate(mcpReq, policy).verdict, 'execute')
  assert.equal(evaluate(a2aReq, policy).verdict, 'execute')
})

test('MAVLink enters the existing governed pipeline and safety commands halt for COS approval', async () => {
  const r = registry()
  const { host, performed, approvals, events } = buyerHost()
  const req = r.normalize('mavlink', {
    id: 'flight-17',
    system_id: 42,
    tenantId: 'acme',
    command: 'NAV_LAND',
    params: { latitude: 12.1364, longitude: -86.2514 },
  })

  assert.equal(req.protocol, 'mavlink')
  assert.equal(req.action.kind, 'robot_command')
  assert.equal(req.action.target, 'NAV_LAND')

  const out = await runGoverned(req, policy, host)
  assert.equal(out.consequenceClass, 'safety')
  assert.equal(out.verdict, 'halt_for_approval')
  assert.equal(performed.length, 0)
  assert.equal(approvals.length, 1)
  assert.ok(events.some((e) => e.eventType === 'agent.halted_for_approval'))

  const ack = r.denormalize('mavlink', out) as Record<string, any>
  assert.equal(ack.requestId, 'flight-17')
  assert.equal(ack.result, 'MAV_RESULT_TEMPORARILY_REJECTED')
  assert.equal(ack.governance.verdict, 'halt_for_approval')
})

test('financial halt holds across BOTH software protocols', () => {
  const r = registry()
  const viaMcp = r.normalize('mcp', { id: 'm', agent: 'b', params: { name: 'send-payout', arguments: {} } })
  const viaA2a = r.normalize('a2a', { taskId: 't', from: 'b', kind: 'tool_call', skill: 'send-payout' })
  assert.equal(evaluate(viaMcp, policy).verdict, 'halt_for_approval')
  assert.equal(evaluate(viaA2a, policy).verdict, 'halt_for_approval')
})

test('outcomes denormalize back into each protocol\'s own envelope', async () => {
  const r = registry()
  const { host } = buyerHost()
  const req = r.normalize('mcp', { id: 'r9', agent: 'bot', params: { name: 'restart-worker', arguments: {} } })
  const out = await runGoverned(req, policy, host)
  const mcpEnv = r.denormalize('mcp', out) as Record<string, any>
  assert.equal(mcpEnv.id, 'r9')
  assert.equal(mcpEnv.governance.verdict, 'execute')
  const a2aOut = { ...out, requestId: 't9' }
  const a2aEnv = r.denormalize('a2a', a2aOut) as Record<string, any>
  assert.equal(a2aEnv.taskId, 't9')
  assert.equal(a2aEnv.status, 'completed')
})
