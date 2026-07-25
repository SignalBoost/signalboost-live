import test from 'node:test'
import assert from 'node:assert/strict'

import { planClusterAlertEscalations } from '../agent-gateway/cluster-alert-escalation.ts'
import type { ClusterAlertDiagnosticsSnapshot } from '../agent-gateway/cluster-alert-diagnostics.ts'

function diagnostics(): ClusterAlertDiagnosticsSnapshot {
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-alert-diagnostics-v1', clusterId: 'cluster-a', generatedAt: '2026-07-25T22:30:00.000Z', status: 'critical', totalAlerts: 4, activeAlerts: 2, acknowledgedAlerts: 1, resolvedAlerts: 1, recurringAlerts: 2, staleAlerts: 1, warningAlerts: 1, criticalAlerts: 1,
    items: Object.freeze([
      Object.freeze({ schemaVersion: 'agent-gateway-cluster-alert-diagnostic-item-v1', alertId: 'a-critical', instructionId: 'i1', kind: 'stale-term', severity: 'critical', state: 'open', recurring: true, stale: true, occurrenceCount: 5, firstDetectedAt: '2026-07-25T21:00:00.000Z', lastDetectedAt: '2026-07-25T22:00:00.000Z', acknowledgedAt: null, acknowledgedBy: null, resolvedAt: null, resolutionReason: null, readOnly: true, automaticRemediationEnabled: false, executable: false }),
      Object.freeze({ schemaVersion: 'agent-gateway-cluster-alert-diagnostic-item-v1', alertId: 'b-warning', instructionId: 'i2', kind: 'missing-acknowledgment', severity: 'warning', state: 'open', recurring: false, stale: false, occurrenceCount: 1, firstDetectedAt: '2026-07-25T22:28:00.000Z', lastDetectedAt: '2026-07-25T22:28:00.000Z', acknowledgedAt: null, acknowledgedBy: null, resolvedAt: null, resolutionReason: null, readOnly: true, automaticRemediationEnabled: false, executable: false }),
      Object.freeze({ schemaVersion: 'agent-gateway-cluster-alert-diagnostic-item-v1', alertId: 'c-ack', instructionId: 'i3', kind: 'repeated-retry', severity: 'info', state: 'acknowledged', recurring: true, stale: false, occurrenceCount: 3, firstDetectedAt: '2026-07-25T22:00:00.000Z', lastDetectedAt: '2026-07-25T22:20:00.000Z', acknowledgedAt: '2026-07-25T22:21:00.000Z', acknowledgedBy: 'operator-1', resolvedAt: null, resolutionReason: null, readOnly: true, automaticRemediationEnabled: false, executable: false }),
      Object.freeze({ schemaVersion: 'agent-gateway-cluster-alert-diagnostic-item-v1', alertId: 'd-resolved', instructionId: 'i4', kind: 'expired-outcome', severity: 'warning', state: 'resolved', recurring: false, stale: false, occurrenceCount: 1, firstDetectedAt: '2026-07-25T21:00:00.000Z', lastDetectedAt: '2026-07-25T21:10:00.000Z', acknowledgedAt: null, acknowledgedBy: null, resolvedAt: '2026-07-25T21:15:00.000Z', resolutionReason: 'closed', readOnly: true, automaticRemediationEnabled: false, executable: false }),
    ]), safety: Object.freeze({ readOnly: true, remediationControlsExposed: false, automaticRemediationEnabled: false }), executable: false,
  })
}

test('plans deterministic escalation levels without notifications or remediation', () => {
  const plan = planClusterAlertEscalations({ diagnostics: diagnostics() })
  assert.equal(plan.highestLevel, 'executive')
  assert.deepEqual(plan.recommendations.map(item => [item.alertId, item.level]), [['a-critical', 'executive'], ['b-warning', 'operator'], ['c-ack', 'incident']])
  assert.equal(plan.notificationsEnabled, false)
  assert.equal(plan.automaticRemediationEnabled, false)
  assert.equal(plan.executable, false)
})

test('rejects invalid escalation boundary ordering', () => {
  assert.throws(() => planClusterAlertEscalations({ diagnostics: diagnostics(), policy: { operatorAfterMs: 10, incidentAfterMs: 5 } }), /boundary order/)
})
