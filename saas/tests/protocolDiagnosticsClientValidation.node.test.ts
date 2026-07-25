import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PROTOCOL_DIAGNOSTICS_SCHEMA_VERSION,
  validateProtocolDiagnosticsSnapshot,
} from '../lib/supervisor/protocol-diagnostics-client.ts'

const validSnapshot = {
  generatedAt: '2026-07-25T19:00:00.000Z',
  summary: { protocols: 1, mutatingProtocols: 0, supervisoryOnlyProtocols: 1, safetyClassifiedProtocols: 1 },
  protocols: [{ protocolId: 'opc-ua', version: '1', domain: 'physical', operations: ['observe'], mutating: false, safetyHints: ['safety'], evidence: ['registry'], supervisoryOnly: true }],
  safety: { readOnly: true, executionControlsExposed: false, mutationControlsExposed: false },
  schemaVersion: PROTOCOL_DIAGNOSTICS_SCHEMA_VERSION,
}

test('accepts a complete read-only protocol diagnostics snapshot', () => {
  assert.ok(validateProtocolDiagnosticsSnapshot(validSnapshot))
})

test('rejects schema drift', () => {
  assert.equal(validateProtocolDiagnosticsSnapshot({ ...validSnapshot, schemaVersion: 'unexpected-v2' }), null)
})

test('rejects snapshots that expose execution or mutation controls', () => {
  assert.equal(validateProtocolDiagnosticsSnapshot({ ...validSnapshot, safety: { ...validSnapshot.safety, executionControlsExposed: true } }), null)
  assert.equal(validateProtocolDiagnosticsSnapshot({ ...validSnapshot, safety: { ...validSnapshot.safety, mutationControlsExposed: true } }), null)
})

test('rejects inconsistent counts and incomplete protocol metadata', () => {
  assert.equal(validateProtocolDiagnosticsSnapshot({ ...validSnapshot, summary: { ...validSnapshot.summary, protocols: 2 } }), null)
  assert.equal(validateProtocolDiagnosticsSnapshot({ ...validSnapshot, protocols: [{ ...validSnapshot.protocols[0], evidence: [] }] }), null)
})
