// saas/agent-gateway/cluster-runtime-health-timeline.ts
// Immutable transition timeline for governed cluster runtime health snapshots.
// This module records observation history only; it never retries, repairs, or mutates infrastructure.

import type { ClusterRuntimeHealthSnapshot, ClusterRuntimeHealthStatus } from './cluster-runtime-health.ts'

export interface ClusterRuntimeHealthTimelineEntry {
  schemaVersion: 'agent-gateway-cluster-runtime-health-timeline-entry-v1'
  transitionId: string
  clusterId: string
  currentTerm: number
  status: ClusterRuntimeHealthStatus
  firstObservedAt: string
  lastObservedAt: string
  durationMs: number
  reasons: readonly string[]
  triggeringAlertIds: readonly string[]
  readOnly: true
  infrastructureMutationEnabled: false
  automaticRepairEnabled: false
  executable: false
}

export interface ClusterRuntimeHealthTimeline {
  schemaVersion: 'agent-gateway-cluster-runtime-health-timeline-v1'
  clusterId: string
  generatedAt: string
  entries: readonly ClusterRuntimeHealthTimelineEntry[]
  transitionCount: number
  safety: Readonly<{ readOnly: true; infrastructureMutationEnabled: false; automaticRetryEnabled: false; automaticRepairEnabled: false }>
  executable: false
}

export interface ClusterRuntimeHealthObservation {
  health: ClusterRuntimeHealthSnapshot
  triggeringAlertIds?: readonly string[]
}

function ms(value: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error('invalid cluster runtime health timeline timestamp')
  return parsed
}

function validateHealth(health: ClusterRuntimeHealthSnapshot): void {
  if (!health || health.schemaVersion !== 'agent-gateway-cluster-runtime-health-v1') throw new Error('invalid cluster runtime health observation')
  if (health.executable !== false || health.safety.infrastructureMutationEnabled !== false || health.safety.automaticRepairEnabled !== false) throw new Error('unsafe cluster runtime health observation')
}

export function createClusterRuntimeHealthTimeline(observations: readonly ClusterRuntimeHealthObservation[]): ClusterRuntimeHealthTimeline {
  if (!Array.isArray(observations) || observations.length === 0) throw new Error('cluster runtime health timeline requires observations')
  const sorted = [...observations].sort((a, b) => ms(a.health.generatedAt) - ms(b.health.generatedAt) || a.health.status.localeCompare(b.health.status))
  const clusterId = sorted[0].health.clusterId
  const entries: ClusterRuntimeHealthTimelineEntry[] = []

  for (const observation of sorted) {
    validateHealth(observation.health)
    if (observation.health.clusterId !== clusterId) throw new Error('cluster runtime health timeline identity mismatch')
    const observedAt = new Date(ms(observation.health.generatedAt)).toISOString()
    const alertIds = Object.freeze([...(observation.triggeringAlertIds ?? [])].map(String).sort())
    const previous = entries.at(-1)
    if (previous && previous.status === observation.health.status && previous.currentTerm === observation.health.currentTerm) {
      entries[entries.length - 1] = Object.freeze({
        ...previous,
        lastObservedAt: observedAt,
        durationMs: Math.max(0, ms(observedAt) - ms(previous.firstObservedAt)),
        reasons: Object.freeze([...new Set([...previous.reasons, ...observation.health.reasons])].sort()),
        triggeringAlertIds: Object.freeze([...new Set([...previous.triggeringAlertIds, ...alertIds])].sort()),
      })
      continue
    }
    entries.push(Object.freeze({
      schemaVersion: 'agent-gateway-cluster-runtime-health-timeline-entry-v1',
      transitionId: `${clusterId}:${observation.health.currentTerm}:${observedAt}:${observation.health.status}`,
      clusterId,
      currentTerm: observation.health.currentTerm,
      status: observation.health.status,
      firstObservedAt: observedAt,
      lastObservedAt: observedAt,
      durationMs: 0,
      reasons: Object.freeze([...observation.health.reasons].sort()),
      triggeringAlertIds: alertIds,
      readOnly: true,
      infrastructureMutationEnabled: false,
      automaticRepairEnabled: false,
      executable: false,
    }))
  }

  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-timeline-v1',
    clusterId,
    generatedAt: entries.at(-1)!.lastObservedAt,
    entries: Object.freeze(entries),
    transitionCount: Math.max(0, entries.length - 1),
    safety: Object.freeze({ readOnly: true, infrastructureMutationEnabled: false, automaticRetryEnabled: false, automaticRepairEnabled: false }),
    executable: false,
  })
}
