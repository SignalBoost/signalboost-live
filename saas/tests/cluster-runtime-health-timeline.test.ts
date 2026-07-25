import assert from 'node:assert/strict'
import test from 'node:test'

import { createClusterRuntimeHealthTimeline } from '../agent-gateway/cluster-runtime-health-timeline.ts'
import type { ClusterRuntimeHealthSnapshot, ClusterRuntimeHealthStatus } from '../agent-gateway/cluster-runtime-health.ts'

function health(status: ClusterRuntimeHealthStatus, generatedAt: string, reasons: readonly string[] = []): ClusterRuntimeHealthSnapshot {
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-v1',
    generatedAt,
    clusterId: 'gateway-east',
    currentTerm: 7,
    status,
    summary: Object.freeze({ totalInstructions: 1, pendingAcknowledgments: 0, verifiedOrCompleted: 1, retryRecommendations: 0, terminalOutcomes: 0, staleTerms: 0, warningAlerts: 0, criticalAlerts: 0, humanReviewRequired: 0 }),
    reasons: Object.freeze([...reasons]),
    safety: Object.freeze({ readOnly: true, automaticRetryEnabled: false, automaticRepairEnabled: false, infrastructureMutationEnabled: false, runtimeExecutionControlsExposed: false }),
    executable: false,
  })
}

test('orders observations and records health transitions', () => {
  const timeline = createClusterRuntimeHealthTimeline([
    { health: health('warning', '2026-07-25T22:02:00Z', ['retry pending']), triggeringAlertIds: ['alert-2'] },
    { health: health('healthy', '2026-07-25T22:00:00Z') },
    { health: health('critical', '2026-07-25T22:03:00Z', ['stale term']), triggeringAlertIds: ['alert-3'] },
  ])
  assert.deepEqual(timeline.entries.map(entry => entry.status), ['healthy', 'warning', 'critical'])
  assert.equal(timeline.transitionCount, 2)
  assert.equal(timeline.generatedAt, '2026-07-25T22:03:00.000Z')
})

test('collapses consecutive duplicate states and calculates duration', () => {
  const timeline = createClusterRuntimeHealthTimeline([
    { health: health('warning', '2026-07-25T22:00:00Z', ['first']), triggeringAlertIds: ['b'] },
    { health: health('warning', '2026-07-25T22:01:30Z', ['second']), triggeringAlertIds: ['a'] },
  ])
  assert.equal(timeline.entries.length, 1)
  assert.equal(timeline.entries[0].durationMs, 90_000)
  assert.deepEqual(timeline.entries[0].reasons, ['first', 'second'])
  assert.deepEqual(timeline.entries[0].triggeringAlertIds, ['a', 'b'])
})

test('fails closed for mixed clusters and unsafe observations', () => {
  const mixed = { ...health('healthy', '2026-07-25T22:01:00Z'), clusterId: 'other' } as ClusterRuntimeHealthSnapshot
  assert.throws(() => createClusterRuntimeHealthTimeline([{ health: health('healthy', '2026-07-25T22:00:00Z') }, { health: mixed }]), /identity mismatch/)
  const unsafe = { ...health('healthy', '2026-07-25T22:00:00Z'), executable: true } as unknown as ClusterRuntimeHealthSnapshot
  assert.throws(() => createClusterRuntimeHealthTimeline([{ health: unsafe }]), /unsafe/)
})
