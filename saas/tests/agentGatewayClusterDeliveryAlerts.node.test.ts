import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateClusterDeliveryAlerts } from '../agent-gateway/cluster-delivery-alerts.ts'
import type { ClusterDeliveryDiagnosticsSnapshot } from '../agent-gateway/cluster-delivery-diagnostics.ts'

function diagnostics(items: ClusterDeliveryDiagnosticsSnapshot['items']): ClusterDeliveryDiagnosticsSnapshot {
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-delivery-diagnostics-v1',
    generatedAt: '2026-07-25T22:00:00.000Z',
    clusterId: 'gateway-us-east',
    currentTerm: 5,
    status: 'degraded',
    counts: Object.freeze({ staged: 0, dispatched: 0, retrying: 0, acknowledged: 0, terminal: 0, 'stale-term': 0 }),
    totalInstructions: items.length,
    retryRequired: 0,
    staleTermCount: 0,
    items,
    safety: Object.freeze({ readOnly: true, infrastructureMutationEnabled: false, runtimeExecutionControlsExposed: false }),
    executable: false,
  })
}

function item(overrides: Partial<ClusterDeliveryDiagnosticsSnapshot['items'][number]> = {}): ClusterDeliveryDiagnosticsSnapshot['items'][number] {
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-delivery-diagnostic-item-v1',
    instructionId: 'gateway-us-east:5:promote:gateway-b',
    clusterId: 'gateway-us-east',
    term: 5,
    runtimeId: 'runtime-a',
    replicaId: 'gateway-b',
    action: 'promote',
    state: 'dispatched',
    attempt: 1,
    lastDispatchedAt: '2026-07-25T21:58:00.000Z',
    acknowledgedAt: null,
    terminalReceiptState: null,
    reason: 'instruction dispatched',
    readOnly: true,
    infrastructureMutationEnabled: false,
    executable: false,
    ...overrides,
  })
}

test('alerts on stalled dispatch and missing acknowledgment', () => {
  const result = evaluateClusterDeliveryAlerts({ diagnostics: diagnostics([item()]), policy: { stalledAfterMs: 60_000, missingAcknowledgmentAfterMs: 30_000 } })
  assert.deepEqual(result.alerts.map(alert => alert.kind), ['missing-acknowledgment', 'stalled-dispatch'])
  assert.equal(result.highestSeverity, 'warning')
  assert.equal(result.automaticRepairEnabled, false)
})

test('alerts critically on stale term and rejection', () => {
  const result = evaluateClusterDeliveryAlerts({ diagnostics: diagnostics([item({ state: 'stale-term', terminalReceiptState: 'rejected' })]) })
  assert.deepEqual(result.alerts.map(alert => alert.kind), ['rejected-outcome', 'stale-term'])
  assert.equal(result.counts.critical, 2)
  assert.equal(result.alerts.every(alert => alert.requiresHumanReview), true)
})

test('alerts on repeated retry threshold', () => {
  const result = evaluateClusterDeliveryAlerts({ diagnostics: diagnostics([item({ state: 'retrying', attempt: 3 })]) })
  assert.equal(result.alerts.some(alert => alert.kind === 'repeated-retry'), true)
})

test('returns no alerts for completed delivery', () => {
  const result = evaluateClusterDeliveryAlerts({ diagnostics: diagnostics([item({ state: 'acknowledged', acknowledgedAt: '2026-07-25T21:58:10.000Z' })]) })
  assert.equal(result.alerts.length, 0)
  assert.equal(result.highestSeverity, null)
})

test('rejects invalid policy', () => {
  assert.throws(() => evaluateClusterDeliveryAlerts({ diagnostics: diagnostics([]), policy: { repeatedRetryThreshold: 1 } }), /invalid repeated retry threshold/)
})
