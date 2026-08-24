import type { DataCenterObservation, DataCenterSeverity } from './observation.ts'

export type DataCenterIncidentCluster = {
  clusterId: string
  siteId: string
  startedAt: string
  endedAt: string
  severity: DataCenterSeverity
  observations: DataCenterObservation[]
  sharedCorrelationKeys: string[]
  evidenceSummary: string[]
}

const severityRank: Record<DataCenterSeverity, number> = { info: 0, warning: 1, critical: 2 }

function strongestSeverity(observations: DataCenterObservation[]): DataCenterSeverity {
  return observations.reduce<DataCenterSeverity>(
    (best, observation) => severityRank[observation.severity] > severityRank[best] ? observation.severity : best,
    'info',
  )
}

function sharedKeys(a: DataCenterObservation, b: DataCenterObservation): string[] {
  const right = new Set(b.correlationKeys)
  return a.correlationKeys.filter(key => right.has(key))
}

function closeEnough(a: DataCenterObservation, b: DataCenterObservation, windowMs: number): boolean {
  return Math.abs(Date.parse(a.observedAt) - Date.parse(b.observedAt)) <= windowMs
}

function explicitlyRelated(a: DataCenterObservation, b: DataCenterObservation): boolean {
  if (a.siteId !== b.siteId) return false
  if (a.assetId === b.assetId && a.assetClass === b.assetClass) return true
  return sharedKeys(a, b).length > 0
}

function stableClusterId(observations: DataCenterObservation[]): string {
  const ids = observations.map(item => item.observationId).sort().join('|')
  let hash = 2166136261
  for (const char of ids) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `dc-cluster-${(hash >>> 0).toString(36)}`
}

function commonCorrelationKeys(observations: DataCenterObservation[]): string[] {
  if (!observations.length) return []
  let current = new Set(observations[0].correlationKeys)
  for (const observation of observations.slice(1)) {
    current = new Set([...current].filter(key => observation.correlationKeys.includes(key)))
  }
  return [...current].sort()
}

function clusterEvidenceSummary(observations: DataCenterObservation[]): string[] {
  return observations.flatMap(observation => observation.evidence.map(item => item.summary)).slice(0, 20)
}

/**
 * Deterministic evidence clustering for data-center observations.
 *
 * Deliberately conservative: events are grouped only when they are from the same site,
 * occur within the bounded time window, and share an explicit correlation key or exact
 * asset identity. Merely happening at the same time in the same facility is not enough.
 * This protects COS from receiving a pre-baked false causal cluster.
 */
export function clusterDataCenterObservations(
  observations: DataCenterObservation[],
  options: { windowMs?: number } = {},
): DataCenterIncidentCluster[] {
  const windowMs = Math.max(60_000, Math.min(options.windowMs ?? 15 * 60_000, 60 * 60_000))
  const ordered = [...observations].sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))
  const parent = ordered.map((_, index) => index)

  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index])
    return parent[index]
  }

  const union = (left: number, right: number) => {
    const l = find(left)
    const r = find(right)
    if (l !== r) parent[r] = l
  }

  for (let left = 0; left < ordered.length; left += 1) {
    for (let right = left + 1; right < ordered.length; right += 1) {
      if (!closeEnough(ordered[left], ordered[right], windowMs)) continue
      if (explicitlyRelated(ordered[left], ordered[right])) union(left, right)
    }
  }

  const groups = new Map<number, DataCenterObservation[]>()
  ordered.forEach((observation, index) => {
    const root = find(index)
    const group = groups.get(root) ?? []
    group.push(observation)
    groups.set(root, group)
  })

  return [...groups.values()]
    .map(group => ({
      clusterId: stableClusterId(group),
      siteId: group[0].siteId,
      startedAt: group[0].observedAt,
      endedAt: group[group.length - 1].observedAt,
      severity: strongestSeverity(group),
      observations: group,
      sharedCorrelationKeys: commonCorrelationKeys(group),
      evidenceSummary: clusterEvidenceSummary(group),
    }))
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
}
