import test from 'node:test'
import assert from 'node:assert/strict'

import { analyzeClusterEscalationTrends } from '../agent-gateway/cluster-escalation-trends.ts'
import type { ClusterEscalationDiagnosticsSnapshot } from '../agent-gateway/cluster-escalation-diagnostics.ts'

function snapshot(at: string, active: number, recurring: number, incident: number, executive: number): ClusterEscalationDiagnosticsSnapshot {
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-escalation-diagnostics-v1', clusterId: 'cluster-a', generatedAt: at, status: executive ? 'critical' : incident || active ? 'degraded' : 'healthy', totalRecommendations: active, openRecommendations: active, acknowledgedRecommendations: 0, closedRecommendations: 0, expiredRecommendations: 0, recurringRecommendations: recurring, staleRecommendations: 0, incidentRecommendations: incident, executiveRecommendations: executive, items: Object.freeze([]), safety: Object.freeze({ readOnly: true, notificationControlsExposed: false, remediationControlsExposed: false, notificationsEnabled: false, automaticRemediationEnabled: false }), executable: false,
  })
}

test('classifies rising escalation pressure deterministically', () => {
  const result = analyzeClusterEscalationTrends({ clusterId: 'cluster-a', snapshots: [snapshot('2026-07-25T20:00:00Z', 1, 0, 0, 0), snapshot('2026-07-25T21:00:00Z', 2, 1, 1, 1)] })
  assert.equal(result.trend, 'rising')
  assert.equal(result.recurringPressure, true)
  assert.equal(result.incidentPressure, true)
  assert.equal(result.executivePressure, true)
  assert.equal(result.notificationsEnabled, false)
  assert.equal(result.automaticRemediationEnabled, false)
})

test('classifies declining and stable pressure', () => {
  assert.equal(analyzeClusterEscalationTrends({ clusterId: 'cluster-a', snapshots: [snapshot('2026-07-25T20:00:00Z', 3, 1, 1, 0), snapshot('2026-07-25T21:00:00Z', 0, 0, 0, 0)] }).trend, 'declining')
  assert.equal(analyzeClusterEscalationTrends({ clusterId: 'cluster-a', snapshots: [snapshot('2026-07-25T20:00:00Z', 1, 0, 0, 0), snapshot('2026-07-25T21:00:00Z', 2, 0, 0, 0)], stableDelta: 1 }).trend, 'stable')
})

test('rejects duplicate timestamps and cluster mismatches', () => {
  const item = snapshot('2026-07-25T20:00:00Z', 1, 0, 0, 0)
  assert.throws(() => analyzeClusterEscalationTrends({ clusterId: 'cluster-a', snapshots: [item, item] }), /duplicate/)
  assert.throws(() => analyzeClusterEscalationTrends({ clusterId: 'cluster-b', snapshots: [item] }), /mismatch/)
})
