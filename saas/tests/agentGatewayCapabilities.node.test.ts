import './cluster-runtime-health-governance-evidence-index-query.test.ts'

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ProtocolRegistry,
  createMcpAdapter,
  createA2aAdapter,
  createMavlinkAdapter,
  createRos2Adapter,
  createOpcUaAdapter,
  createMqttAdapter,
  type ProtocolAdapter,
} from '../agent-gateway/index.ts'

function registry() {
  const r = new ProtocolRegistry()
  r.register(createMcpAdapter())
  r.register(createA2aAdapter())
  r.register(createMavlinkAdapter())
  r.register(createRos2Adapter())
  r.register(createOpcUaAdapter())
  r.register(createMqttAdapter())
  return r
}

test('all shipped protocols publish capability metadata', () => {
  const catalog = registry().capabilityCatalog()
  assert.deepEqual(Object.keys(catalog).sort(), ['a2a', 'mavlink', 'mcp', 'mqtt', 'opcua', 'ros2'])
  for (const metadata of Object.values(catalog)) {
    assert.ok(metadata.version)
    assert.ok(metadata.operations.length > 0)
    assert.ok(metadata.evidence.includes('decision'))
    assert.ok(metadata.evidence.includes('result'))
  }
})

test('physical and industrial protocols declare supervisory safety boundaries', () => {
  const r = registry()
  for (const id of ['mavlink', 'ros2', 'opcua', 'mqtt']) {
    const metadata = r.capabilities(id)
    assert.equal(metadata.supervisoryOnly, true)
    assert.ok(metadata.safetyHints.includes('safety'))
    assert.ok(metadata.evidence.includes('approval'))
  }
})

test('registry rejects incomplete metadata', () => {
  const incomplete = {
    protocolId: 'broken',
    capabilities: { version: '', domain: 'other', operations: [], mutating: false, safetyHints: ['unknown'], evidence: [] },
    normalize() { throw new Error('unused') },
    denormalize() { return undefined },
  } as ProtocolAdapter
  assert.throws(() => new ProtocolRegistry().register(incomplete), /incomplete capability metadata/)
})
