import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ClusterAlertLifecycleController,
  InMemoryClusterAlertLifecycleStore,
  type ClusterDeliveryAlertEvaluation,
} from '../agent-gateway/index.ts'

function evaluation(alerts: ClusterDeliveryAlertEvaluation['alerts'], generatedAt = '2026-07-25T22:00:00.000Z'): ClusterDeliveryAlertEvaluation {
  return Object.freeze({ schemaVersion: 'agent-gateway-cluster-delivery-alert-evaluation-v1', clusterId: 'cluster-1', generatedAt, alerts: Object.freeze([...alerts]), counts: Object.freeze({ info: 0, warning: alerts.length, critical: 0 }), highestSeverity: alerts.length ? 'warning' : null, automaticRepairEnabled: false, readOnly: true, executable: false })
}

const alert = Object.freeze({ schemaVersion: 'agent-gateway-cluster-delivery-alert-v1' as const, alertId: 'instruction-1:stalled-dispatch', clusterId: 'cluster-1', instructionId: 'instruction-1', runtimeId: 'runtime-1', term: 2, kind: 'stalled-dispatch' as const, severity: 'warning' as const, detectedAt: '2026-07-25T22:00:00.000Z', reason: 'stalled', attempt: 1, requiresHumanReview: false, automaticRepairEnabled: false as const, readOnly: true as const, executable: false as const })

test('opens, deduplicates, acknowledges, resolves, and reopens recurring alerts', async () => {
  const controller = new ClusterAlertLifecycleController(new InMemoryClusterAlertLifecycleStore())
  const [opened] = await controller.ingest(evaluation([alert]))
  assert.equal(opened.state, 'open')
  assert.equal(opened.occurrenceCount, 1)

  const [repeated] = await controller.ingest(evaluation([{ ...alert, detectedAt: '2026-07-25T22:01:00.000Z' }], '2026-07-25T22:01:00.000Z'))
  assert.equal(repeated.occurrenceCount, 2)

  const acknowledged = await controller.acknowledge(alert.alertId, 'operator-1', new Date('2026-07-25T22:02:00.000Z'))
  assert.equal(acknowledged.state, 'acknowledged')

  const resolved = await controller.resolve(alert.alertId, 'runtime recovered', new Date('2026-07-25T22:03:00.000Z'))
  assert.equal(resolved.state, 'resolved')

  const [reopened] = await controller.ingest(evaluation([{ ...alert, detectedAt: '2026-07-25T22:04:00.000Z' }], '2026-07-25T22:04:00.000Z'))
  assert.equal(reopened.state, 'open')
  assert.equal(reopened.occurrenceCount, 3)
  assert.equal(reopened.automaticRemediationEnabled, false)
})

test('cleanup resolves alerts absent from current evaluation', async () => {
  const controller = new ClusterAlertLifecycleController(new InMemoryClusterAlertLifecycleStore())
  await controller.ingest(evaluation([alert]))
  const result = await controller.cleanup('cluster-1', [], new Date('2026-07-25T22:05:00.000Z'))
  assert.deepEqual(result.resolvedAlertIds, [alert.alertId])
  assert.equal(result.executable, false)
})
