import test from 'node:test'
import assert from 'node:assert/strict'

import { createClusterAlertDiagnostics } from '../agent-gateway/cluster-alert-diagnostics.ts'
import type { ClusterAlertLifecycleRecord } from '../agent-gateway/cluster-alert-lifecycle.ts'

function record(overrides: Partial<ClusterAlertLifecycleRecord> = {}): ClusterAlertLifecycleRecord {
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-alert-lifecycle-v1',
    alertId: 'cluster-1:instruction-1:stalled-dispatch',
    clusterId: 'cluster-1',
    instructionId: 'instruction-1',
    kind: 'stalled-dispatch',
    severity: 'warning',
    state: 'open',
    firstDetectedAt: '2026-07-25T20:00:00.000Z',
    lastDetectedAt: '2026-07-25T20:05:00.000Z',
    occurrenceCount: 2,
    automaticRemediationEnabled: false,
    readOnly: true,
    executable: false,
    ...overrides,
  })
}

test('aggregates active, acknowledged, resolved, recurring, warning, critical, and stale alerts', () => {
  const snapshot = createClusterAlertDiagnostics({
    clusterId: 'cluster-1',
    generatedAt: '2026-07-25T20:20:00.000Z',
    staleAfterMs: 600_000,
    records: [
      record(),
      record({ alertId: 'cluster-1:instruction-2:stale-term', instructionId: 'instruction-2', kind: 'stale-term', severity: 'critical', state: 'acknowledged', occurrenceCount: 1, acknowledgedAt: '2026-07-25T20:06:00.000Z', acknowledgedBy: 'operator-1' }),
      record({ alertId: 'cluster-1:instruction-3:expired-outcome', instructionId: 'instruction-3', kind: 'expired-outcome', severity: 'warning', state: 'resolved', occurrenceCount: 1, resolvedAt: '2026-07-25T20:08:00.000Z', resolutionReason: 'delivery completed' }),
    ],
  })
  assert.equal(snapshot.status, 'critical')
  assert.equal(snapshot.activeAlerts, 1)
  assert.equal(snapshot.acknowledgedAlerts, 1)
  assert.equal(snapshot.resolvedAlerts, 1)
  assert.equal(snapshot.recurringAlerts, 1)
  assert.equal(snapshot.staleAlerts, 2)
  assert.equal(snapshot.warningAlerts, 1)
  assert.equal(snapshot.criticalAlerts, 1)
  assert.equal(snapshot.safety.remediationControlsExposed, false)
})

test('reports healthy when all lifecycle records are resolved', () => {
  const snapshot = createClusterAlertDiagnostics({
    clusterId: 'cluster-1',
    generatedAt: '2026-07-25T20:20:00.000Z',
    records: [record({ state: 'resolved', resolvedAt: '2026-07-25T20:10:00.000Z', resolutionReason: 'operator verified recovery' })],
  })
  assert.equal(snapshot.status, 'healthy')
  assert.equal(snapshot.staleAlerts, 0)
})

test('rejects duplicate and cross-cluster lifecycle records', () => {
  const duplicate = record()
  assert.throws(() => createClusterAlertDiagnostics({ clusterId: 'cluster-1', generatedAt: '2026-07-25T20:20:00.000Z', records: [duplicate, duplicate] }), /duplicate/)
  assert.throws(() => createClusterAlertDiagnostics({ clusterId: 'cluster-1', generatedAt: '2026-07-25T20:20:00.000Z', records: [record({ clusterId: 'cluster-2' })] }), /mismatch/)
})
