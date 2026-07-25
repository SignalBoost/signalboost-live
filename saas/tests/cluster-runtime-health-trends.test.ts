import assert from 'node:assert/strict'
import test from 'node:test'

import { analyzeClusterRuntimeHealthTrend } from '../agent-gateway/cluster-runtime-health-trends.ts'
import type { ClusterRuntimeHealthTimeline, ClusterRuntimeHealthTimelineEntry } from '../agent-gateway/cluster-runtime-health-timeline.ts'
import type { ClusterRuntimeHealthStatus } from '../agent-gateway/cluster-runtime-health.ts'

function entry(status: ClusterRuntimeHealthStatus, first: string, last = first): ClusterRuntimeHealthTimelineEntry {
  return Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-timeline-entry-v1', transitionId: `${first}:${status}`, clusterId: 'gateway-east', currentTerm: 7, status, firstObservedAt: first, lastObservedAt: last, durationMs: Date.parse(last) - Date.parse(first), reasons: Object.freeze([]), triggeringAlertIds: Object.freeze([]), readOnly: true, infrastructureMutationEnabled: false, automaticRepairEnabled: false, executable: false })
}

function timeline(entries: readonly ClusterRuntimeHealthTimelineEntry[]): ClusterRuntimeHealthTimeline {
  return Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-timeline-v1', clusterId: 'gateway-east', generatedAt: entries.at(-1)!.lastObservedAt, entries: Object.freeze([...entries]), transitionCount: Math.max(0, entries.length - 1), safety: Object.freeze({ readOnly: true, infrastructureMutationEnabled: false, automaticRetryEnabled: false, automaticRepairEnabled: false }), executable: false })
}

test('classifies improving and degrading trends', () => {
  const improving = analyzeClusterRuntimeHealthTrend(timeline([entry('critical', '2026-07-25T22:00:00Z'), entry('warning', '2026-07-25T22:01:00Z'), entry('healthy', '2026-07-25T22:02:00Z')]))
  assert.equal(improving.trend, 'improving')
  assert.equal(improving.recoveryCount, 2)
  const degrading = analyzeClusterRuntimeHealthTrend(timeline([entry('healthy', '2026-07-25T22:00:00Z'), entry('warning', '2026-07-25T22:01:00Z'), entry('critical', '2026-07-25T22:02:00Z')]))
  assert.equal(degrading.trend, 'degrading')
  assert.equal(degrading.escalationCount, 2)
})

test('detects oscillation and aggregates durations deterministically', () => {
  const result = analyzeClusterRuntimeHealthTrend(timeline([
    entry('healthy', '2026-07-25T22:00:00Z', '2026-07-25T22:01:00Z'),
    entry('warning', '2026-07-25T22:02:00Z', '2026-07-25T22:04:00Z'),
    entry('healthy', '2026-07-25T22:05:00Z', '2026-07-25T22:06:00Z'),
    entry('critical', '2026-07-25T22:07:00Z'),
  ]))
  assert.equal(result.trend, 'oscillating')
  assert.equal(result.oscillationCount, 2)
  assert.equal(result.averageDurationMs.healthy, 60_000)
  assert.equal(result.averageDurationMs.warning, 120_000)
  assert.equal(result.executable, false)
})

test('fails closed for unsafe timelines and mixed entries', () => {
  const base = timeline([entry('healthy', '2026-07-25T22:00:00Z')])
  assert.throws(() => analyzeClusterRuntimeHealthTrend({ ...base, executable: true } as unknown as ClusterRuntimeHealthTimeline), /unsafe/)
  const mixed = { ...entry('warning', '2026-07-25T22:01:00Z'), clusterId: 'other' } as ClusterRuntimeHealthTimelineEntry
  assert.throws(() => analyzeClusterRuntimeHealthTrend(timeline([entry('healthy', '2026-07-25T22:00:00Z'), mixed])), /invalid cluster runtime health trend entry/)
})
