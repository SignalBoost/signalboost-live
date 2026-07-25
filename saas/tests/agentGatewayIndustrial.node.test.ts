// saas/tests/agentGatewayIndustrial.node.test.ts

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ProtocolRegistry,
  evaluate,
  createOpcUaAdapter,
  createMqttAdapter,
  type AgentRequest,
  type ConsequenceClass,
  type GovernancePolicy,
} from '../agent-gateway/index.ts'

const classifier = {
  classify(req: AgentRequest): ConsequenceClass {
    const target = req.action.target
    if (/^(Read:|telemetry\/|status\/)/.test(target)) return 'reversible_internal'
    if (/^(Write:|Call:|commands\/|control\/)/.test(target)) return 'safety'
    return 'unknown'
  },
}

const policy: GovernancePolicy = {
  classifier,
  tenantId: 'acme',
  environment: 'prod',
  allowlist: [
    { actionKind: 'industrial_command', target: 'Read:ns=2;s=Line1.Temperature', rollback: 'read-only' },
    { actionKind: 'industrial_command', target: 'telemetry/line1/temperature', rollback: 'read-only' },
    { actionKind: 'industrial_command', target: 'Write:ns=2;s=Line1.Start', rollback: 'stop line through certified local controls' },
  ],
}

function registry() {
  const r = new ProtocolRegistry()
  r.register(createOpcUaAdapter())
  r.register(createMqttAdapter())
  return r
}

test('OPC UA and MQTT register as governed protocols', () => {
  assert.deepEqual(registry().list().sort(), ['mqtt', 'opcua'])
})

test('OPC UA read normalizes and executes as reversible', () => {
  const req = registry().normalize('opcua', {
    requestId: 'o1', endpointId: 'line-controller', operation: 'Read', nodeId: 'ns=2;s=Line1.Temperature',
  })
  assert.equal(req.action.kind, 'industrial_command')
  assert.equal(req.action.target, 'Read:ns=2;s=Line1.Temperature')
  assert.equal(evaluate(req, policy).verdict, 'execute')
})

test('OPC UA write halts even when allowlisted because safety outranks allowlist', () => {
  const req = registry().normalize('opcua', {
    requestId: 'o2', endpointId: 'line-controller', operation: 'Write', nodeId: 'ns=2;s=Line1.Start', value: { value: true },
  })
  const decision = evaluate(req, policy)
  assert.equal(decision.consequenceClass, 'safety')
  assert.equal(decision.verdict, 'halt_for_approval')
})

test('MQTT telemetry executes while command topics halt', () => {
  const r = registry()
  const telemetry = r.normalize('mqtt', {
    messageId: 'm1', clientId: 'sensor-1', topic: 'telemetry/line1/temperature', payload: { value: 72 },
  })
  assert.equal(evaluate(telemetry, policy).verdict, 'execute')

  const command = r.normalize('mqtt', {
    messageId: 'm2', clientId: 'gateway-1', topic: 'commands/line1/start', payload: { enabled: true },
  })
  assert.equal(evaluate(command, policy).verdict, 'halt_for_approval')
})

test('industrial outcomes denormalize into protocol-native envelopes', () => {
  const r = registry()
  const base = { requestId: 'x', ok: false, verdict: 'halt_for_approval', consequenceClass: 'safety' } as const
  assert.equal((r.denormalize('opcua', base) as any).statusCode, 'BadWouldBlock')
  assert.equal((r.denormalize('mqtt', base) as any).status, 'pending_approval')
})
