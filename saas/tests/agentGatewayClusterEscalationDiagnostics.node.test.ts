import test from 'node:test'
import assert from 'node:assert/strict'

import { createClusterEscalationDiagnostics } from '../agent-gateway/cluster-escalation-diagnostics.ts'
import type { ClusterEscalationLifecycleRecord } from '../agent-gateway/cluster-escalation-lifecycle.ts'

function record(overrides: Partial<ClusterEscalationLifecycleRecord>): ClusterEscalationLifecycleRecord {
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-escalation-lifecycle-v1',
    recommendationId: 'rec-1', alertId: 'alert-1', clusterId: 'cluster-a', level: 'operator', state: 'open',
    firstRecommendedAt: '2026-07-25T22:00:00.000Z', lastRecommendedAt: '2026-07-25T22:00:00.000Z', occurrenceCount: 1,
    notificationsEnabled: false, automaticRemediationEnabled: false, readOnly: true, executable: false,
    ...overrides,
  })
}

test('aggregates escalation lifecycle states and levels deterministically', () => {
  const snapshot = createClusterEscalationDiagnostics({
    clusterId: 'cluster-a', generatedAt: '2026-07-25T22:10:00.000Z', staleAfterMs: 300_000,
    records: [
      record({ recommendationId: 'b', alertId: 'b-alert', level: 'executive', state: 'open', occurrenceCount: 3 }),
      record({ recommendationId: 'a', alertId: 'a-alert', level: 'incident', state: 'acknowledged', acknowledgedAt: '2026-07-25T22:01:00.000Z', acknowledgedBy: 'operator-1', lastRecommendedAt: '2026-07-25T22:09:00.000Z' }),
      record({ recommendationId: 'c', alertId: 'c-alert', level: 'operator', state: 'closed', closedAt: '2026-07-25T22:05:00.000Z', closureReason: 'review complete' }),
      record({ recommendationId: 'd', alertId: 'd-alert', level: 'observe', state: 'expired', expiredAt: '2026-07-25T22:06:00.000Z' }),
    ],
  })
  assert.equal(snapshot.status, 'critical')
  assert.deepEqual(snapshot.items.map(item => item.recommendationId), ['a', 'b', 'c', 'd'])
  assert.equal(snapshot.openRecommendations, 1)
  assert.equal(snapshot.acknowledgedRecommendations, 1)
  assert.equal(snapshot.closedRecommendations, 1)
  assert.equal(snapshot.expiredRecommendations, 1)
  assert.equal(snapshot.recurringRecommendations, 1)
  assert.equal(snapshot.staleRecommendations, 1)
  assert.equal(snapshot.incidentRecommendations, 1)
  assert.equal(snapshot.executiveRecommendations, 1)
  assert.equal(snapshot.safety.notificationControlsExposed, false)
  assert.equal(snapshot.executable, false)
})

test('reports healthy when all recommendations are terminal', () => {
  const snapshot = createClusterEscalationDiagnostics({ clusterId: 'cluster-a', generatedAt: '2026-07-25T22:10:00.000Z', records: [record({ state: 'closed', closedAt: '2026-07-25T22:05:00.000Z' })] })
  assert.equal(snapshot.status, 'healthy')
})

test('rejects duplicate and cross-cluster records', () => {
  const duplicate = record({ recommendationId: 'same' })
  assert.throws(() => createClusterEscalationDiagnostics({ clusterId: 'cluster-a', generatedAt: '2026-07-25T22:10:00.000Z', records: [duplicate, duplicate] }), /duplicate/)
  assert.throws(() => createClusterEscalationDiagnostics({ clusterId: 'cluster-a', generatedAt: '2026-07-25T22:10:00.000Z', records: [record({ clusterId: 'cluster-b' })] }), /mismatch/)
})
