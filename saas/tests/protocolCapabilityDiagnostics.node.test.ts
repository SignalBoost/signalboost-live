import assert from 'node:assert/strict'
import test from 'node:test'
import { createProtocolCapabilityDiagnostics } from '../lib/supervisor/operator-diagnostics/protocol-capabilities.ts'

test('creates deterministic read-only protocol capability diagnostics', () => {
  const generatedAt = '2026-07-25T12:00:00.000Z'
  const catalog = {
    ros2: {
      version: '1',
      domain: 'robotics',
      operations: ['command', 'read'],
      mutating: true,
      safetyHints: ['safety'],
      evidence: ['request', 'decision', 'approval', 'result', 'telemetry'],
      supervisoryOnly: true,
    },
    mcp: {
      version: '1',
      domain: 'software',
      operations: ['read', 'write'],
      mutating: true,
      safetyHints: ['reversible_internal', 'external_effect'],
      evidence: ['request', 'decision', 'result'],
    },
  } as const

  const first = createProtocolCapabilityDiagnostics(generatedAt, catalog)
  const second = createProtocolCapabilityDiagnostics(generatedAt, catalog)

  assert.deepEqual(first, second)
  assert.equal(first.schemaVersion, 'protocol-capability-diagnostics-v1')
  assert.deepEqual(first.protocols.map(protocol => protocol.protocolId), ['mcp', 'ros2'])
  assert.equal(first.summary.protocols, 2)
  assert.equal(first.summary.mutatingProtocols, 2)
  assert.equal(first.summary.supervisoryOnlyProtocols, 1)
  assert.equal(first.summary.safetyClassifiedProtocols, 1)
  assert.deepEqual(first.safety, {
    readOnly: true,
    executionControlsExposed: false,
    mutationControlsExposed: false,
  })
})

test('fails closed on invalid timestamps and incomplete metadata', () => {
  assert.throws(() => createProtocolCapabilityDiagnostics('invalid', {}), /invalid_protocol_capability_diagnostics_timestamp/)
  assert.throws(() => createProtocolCapabilityDiagnostics('2026-07-25T12:00:00.000Z', {
    broken: {
      version: '',
      domain: 'other',
      operations: [],
      mutating: false,
      safetyHints: ['unknown'],
      evidence: [],
    },
  }), /incomplete_protocol_capability_metadata:broken/)
})
