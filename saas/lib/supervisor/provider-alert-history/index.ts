import type {
  ProviderAlertLifecycleEntry,
  ProviderAlertLifecycleSnapshot,
} from '../provider-alert-lifecycle/index.ts'

export interface ProviderAlertHistoryRecord {
  historyId: string
  alertId: string
  provider: string
  type: ProviderAlertLifecycleEntry['type']
  occurrence: number
  firstOpenedAt: string
  lastObservedAt: string
  escalationCount: number
  deescalationCount: number
  resolvedAt: string | null
  totalActiveDurationMs: number
  status: 'active' | 'resolved'
}

export interface ProviderReliabilityTrendSummary {
  provider: string
  alertOccurrences: number
  activeAlerts: number
  resolvedAlerts: number
  escalationCount: number
  deescalationCount: number
  totalActiveDurationMs: number
  averageResolutionDurationMs: number | null
  lastObservedAt: string
}

export interface ProviderAlertHistorySnapshot {
  generatedAt: string
  summary: {
    total: number
    active: number
    resolved: number
    providers: number
    escalations: number
    deescalations: number
  }
  records: ProviderAlertHistoryRecord[]
  providerTrends: ProviderReliabilityTrendSummary[]
  schemaVersion: 'supervisor-provider-alert-history-v1'
}

interface MutableHistoryRecord extends ProviderAlertHistoryRecord {
  openedAtMs: number
  lastObservedAtMs: number
}

const MAX_RESULTS = 500

function timestamp(value: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(`Invalid provider alert lifecycle timestamp: ${value}`)
  return parsed
}

function duration(record: MutableHistoryRecord, observedAtMs: number): number {
  return Math.max(0, observedAtMs - record.openedAtMs)
}

export function createProviderAlertHistory(
  snapshots: readonly ProviderAlertLifecycleSnapshot[],
  options: { limit?: number } = {},
): ProviderAlertHistorySnapshot {
  const orderedSnapshots = snapshots
    .map((snapshot, index) => ({ snapshot, index, atMs: timestamp(snapshot.generatedAt) }))
    .sort((a, b) => a.atMs - b.atMs || a.index - b.index)

  const active = new Map<string, MutableHistoryRecord>()
  const occurrences = new Map<string, number>()
  const completed: MutableHistoryRecord[] = []

  for (const { snapshot, atMs } of orderedSnapshots) {
    for (const entry of snapshot.entries) {
      const existing = active.get(entry.alertId)

      if (entry.state === 'opened') {
        if (existing) {
          existing.lastObservedAt = snapshot.generatedAt
          existing.lastObservedAtMs = atMs
          existing.totalActiveDurationMs = duration(existing, atMs)
          continue
        }
        const occurrence = (occurrences.get(entry.alertId) ?? 0) + 1
        occurrences.set(entry.alertId, occurrence)
        active.set(entry.alertId, {
          historyId: `${entry.alertId}:${occurrence}`,
          alertId: entry.alertId,
          provider: entry.provider,
          type: entry.type,
          occurrence,
          firstOpenedAt: snapshot.generatedAt,
          lastObservedAt: snapshot.generatedAt,
          escalationCount: 0,
          deescalationCount: 0,
          resolvedAt: null,
          totalActiveDurationMs: 0,
          status: 'active',
          openedAtMs: atMs,
          lastObservedAtMs: atMs,
        })
        continue
      }

      if (!existing) continue

      existing.lastObservedAt = snapshot.generatedAt
      existing.lastObservedAtMs = atMs
      if (entry.state === 'escalated') existing.escalationCount += 1
      if (entry.state === 'deescalated') existing.deescalationCount += 1
      existing.totalActiveDurationMs = duration(existing, atMs)

      if (entry.state === 'resolved') {
        existing.resolvedAt = snapshot.generatedAt
        existing.status = 'resolved'
        active.delete(entry.alertId)
        completed.push(existing)
      }
    }
  }

  const allRecords = [...completed, ...active.values()]
    .sort((a, b) => b.lastObservedAtMs - a.lastObservedAtMs
      || a.provider.localeCompare(b.provider)
      || a.alertId.localeCompare(b.alertId)
      || a.occurrence - b.occurrence)

  const limit = Math.min(MAX_RESULTS, Math.max(0, Math.floor(options.limit ?? 100)))
  const records = allRecords.slice(0, limit).map(({ openedAtMs: _openedAtMs, lastObservedAtMs: _lastObservedAtMs, ...record }) => record)

  const trends = new Map<string, ProviderReliabilityTrendSummary & { resolvedDurationMs: number }>()
  for (const record of records) {
    const trend = trends.get(record.provider) ?? {
      provider: record.provider,
      alertOccurrences: 0,
      activeAlerts: 0,
      resolvedAlerts: 0,
      escalationCount: 0,
      deescalationCount: 0,
      totalActiveDurationMs: 0,
      averageResolutionDurationMs: null,
      lastObservedAt: record.lastObservedAt,
      resolvedDurationMs: 0,
    }
    trend.alertOccurrences += 1
    trend.activeAlerts += record.status === 'active' ? 1 : 0
    trend.resolvedAlerts += record.status === 'resolved' ? 1 : 0
    trend.escalationCount += record.escalationCount
    trend.deescalationCount += record.deescalationCount
    trend.totalActiveDurationMs += record.totalActiveDurationMs
    if (record.status === 'resolved') trend.resolvedDurationMs += record.totalActiveDurationMs
    if (timestamp(record.lastObservedAt) > timestamp(trend.lastObservedAt)) trend.lastObservedAt = record.lastObservedAt
    trends.set(record.provider, trend)
  }

  const providerTrends = [...trends.values()]
    .map(({ resolvedDurationMs, ...trend }) => ({
      ...trend,
      averageResolutionDurationMs: trend.resolvedAlerts > 0
        ? Math.floor(resolvedDurationMs / trend.resolvedAlerts)
        : null,
    }))
    .sort((a, b) => b.activeAlerts - a.activeAlerts
      || b.escalationCount - a.escalationCount
      || a.provider.localeCompare(b.provider))

  return {
    generatedAt: orderedSnapshots.at(-1)?.snapshot.generatedAt ?? new Date(0).toISOString(),
    summary: {
      total: records.length,
      active: records.filter(record => record.status === 'active').length,
      resolved: records.filter(record => record.status === 'resolved').length,
      providers: providerTrends.length,
      escalations: records.reduce((sum, record) => sum + record.escalationCount, 0),
      deescalations: records.reduce((sum, record) => sum + record.deescalationCount, 0),
    },
    records,
    providerTrends,
    schemaVersion: 'supervisor-provider-alert-history-v1',
  }
}
