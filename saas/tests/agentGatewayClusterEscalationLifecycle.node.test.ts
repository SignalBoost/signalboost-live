import test from 'node:test'
import assert from 'node:assert/strict'

import { ClusterEscalationLifecycleController, InMemoryClusterEscalationLifecycleStore } from '../agent-gateway/cluster-escalation-lifecycle.ts'
import type { ClusterAlertEscalationPlan } from '../agent-gateway/cluster-alert-escalation.ts'

function plan(at = '2026-07-25T23:00:00.000Z'): ClusterAlertEscalationPlan {
  return Object.freeze({ schemaVersion: 'agent-gateway-cluster-alert-escalation-plan-v1', clusterId: 'cluster-a', generatedAt: at, recommendations: Object.freeze([Object.freeze({ schemaVersion: 'agent-gateway-cluster-alert-escalation-recommendation-v1', recommendationId: 'alert-a:incident', alertId: 'alert-a', clusterId: 'cluster-a', level: 'incident', reason: 'incident escalation recommended', generatedAt: at, requiresHumanAction: true, notificationSent: false, automaticRemediationEnabled: false, readOnly: true, executable: false })]), counts: Object.freeze({ observe: 0, operator: 0, incident: 1, executive: 0 }), highestLevel: 'incident', notificationsEnabled: false, automaticRemediationEnabled: false, readOnly: true, executable: false })
}

test('tracks creation recurrence acknowledgment closure reopening and expiration', async () => {
  const store = new InMemoryClusterEscalationLifecycleStore(); const controller = new ClusterEscalationLifecycleController(store)
  const [opened] = await controller.ingest(plan()); assert.equal(opened.state, 'open'); assert.equal(opened.occurrenceCount, 1)
  const [recurring] = await controller.ingest(plan('2026-07-25T23:01:00.000Z')); assert.equal(recurring.occurrenceCount, 2)
  const acknowledged = await controller.acknowledge(recurring.recommendationId, 'operator-1', new Date('2026-07-25T23:02:00.000Z')); assert.equal(acknowledged.state, 'acknowledged')
  const closed = await controller.close(recurring.recommendationId, 'review complete', new Date('2026-07-25T23:03:00.000Z')); assert.equal(closed.state, 'closed')
  const [reopened] = await controller.ingest(plan('2026-07-25T23:04:00.000Z')); assert.equal(reopened.state, 'open'); assert.equal(reopened.occurrenceCount, 3)
  const [expired] = await controller.expire('cluster-a', [], new Date('2026-07-25T23:05:00.000Z')); assert.equal(expired.state, 'expired')
  assert.equal(expired.notificationsEnabled, false); assert.equal(expired.automaticRemediationEnabled, false); assert.equal(expired.executable, false)
})

test('rejects identity conflicts', async () => {
  const store = new InMemoryClusterEscalationLifecycleStore(); const controller = new ClusterEscalationLifecycleController(store); await controller.ingest(plan())
  const conflicting = { ...plan('2026-07-25T23:01:00.000Z'), recommendations: Object.freeze([Object.freeze({ ...plan().recommendations[0], clusterId: 'cluster-b' })]) } as ClusterAlertEscalationPlan
  await assert.rejects(() => controller.ingest(conflicting), /identity conflict/)
})
