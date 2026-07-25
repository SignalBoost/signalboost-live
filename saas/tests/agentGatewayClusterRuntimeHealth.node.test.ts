import assert from 'node:assert/strict'
import test from 'node:test'

import { createClusterRuntimeHealth } from '../agent-gateway/cluster-runtime-health.ts'
import type { ClusterDeliveryAlertEvaluation } from '../agent-gateway/cluster-delivery-alerts.ts'
import type { ClusterDeliveryDiagnosticsSnapshot } from '../agent-gateway/cluster-delivery-diagnostics.ts'

function diagnostics(overrides: Partial<ClusterDeliveryDiagnosticsSnapshot> = {}): ClusterDeliveryDiagnosticsSnapshot {
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-delivery-diagnostics-v1',
    generatedAt: '2026-07-25T22:00:00.000Z',
    clusterId: 'gateway-east',
    currentTerm: 7,
    status: 'healthy',
    counts: Object.freeze({ staged: 0, dispatched: 0, retrying: 0, acknowledged: 2, terminal: 0, 'stale-term': 0 }),
    totalInstructions: 2,
    retryRequired: 0,
    staleTermCount: 0,
    items: Object.freeze([]),
    safety: Object.freeze({ readOnly: true, infrastructureMutationEnabled: false, runtimeExecutionControlsExposed: false }),
    executable: false,
    ...overrides,
  })
}

function alerts(overrides: Partial<ClusterDeliveryAlertEvaluation> = {}): ClusterDeliveryAlertEvaluation {
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-delivery-alert-evaluation-v1',
    clusterId: 'gateway-east',
    generatedAt: '2026-07-25T22:00:00.000Z',
    alerts: Object.freeze([]),
    counts: Object.freeze({ info: 0, warning: 0, critical: 0 }),
    highestSeverity: null,
    automaticRepairEnabled: false,
    readOnly: true,
    executable: false,
    ...overrides,
  })
}

test('reports healthy completed delivery', () => {
  const snapshot = createClusterRuntimeHealth({ diagnostics: diagnostics(), alerts: alerts() })
  assert.equal(snapshot.status, 'healthy')
  assert.equal(snapshot.summary.verifiedOrCompleted, 2)
  assert.equal(snapshot.safety.automaticRetryEnabled, false)
  assert.equal(snapshot.executable, false)
})

test('reports unknown while acknowledgments remain pending', () => {
  const snapshot = createClusterRuntimeHealth({
    diagnostics: diagnostics({ counts: Object.freeze({ staged: 1, dispatched: 1, retrying: 0, acknowledged: 0, terminal: 0, 'stale-term': 0 }), totalInstructions: 2 }),
    alerts: alerts(),
  })
  assert.equal(snapshot.status, 'unknown')
  assert.equal(snapshot.summary.pendingAcknowledgments, 2)
})

test('reports warning for retries and critical for stale terms', () => {
  const warning = createClusterRuntimeHealth({
    diagnostics: diagnostics({ counts: Object.freeze({ staged: 0, dispatched: 0, retrying: 1, acknowledged: 0, terminal: 0, 'stale-term': 0 }), totalInstructions: 1, retryRequired: 1 }),
    alerts: alerts({ counts: Object.freeze({ info: 0, warning: 1, critical: 0 }), highestSeverity: 'warning' }),
  })
  assert.equal(warning.status, 'warning')

  const critical = createClusterRuntimeHealth({
    diagnostics: diagnostics({ counts: Object.freeze({ staged: 0, dispatched: 0, retrying: 0, acknowledged: 0, terminal: 0, 'stale-term': 1 }), totalInstructions: 1, staleTermCount: 1, status: 'critical' }),
    alerts: alerts({ counts: Object.freeze({ info: 0, warning: 0, critical: 1 }), highestSeverity: 'critical' }),
  })
  assert.equal(critical.status, 'critical')
})

test('fails closed on mismatched observations', () => {
  assert.throws(() => createClusterRuntimeHealth({ diagnostics: diagnostics(), alerts: alerts({ clusterId: 'other' }) }), /identity mismatch/)
  assert.throws(() => createClusterRuntimeHealth({ diagnostics: diagnostics(), alerts: alerts({ generatedAt: '2026-07-25T22:00:01.000Z' }) }), /observation mismatch/)
})
