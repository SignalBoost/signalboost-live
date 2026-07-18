import type {
  ProviderReliabilityAlert,
  ProviderReliabilityAlertSeverity,
  ProviderReliabilityAlertSnapshot,
} from '../provider-reliability-alerts/index.ts'

export type ProviderAlertLifecycleState = 'opened' | 'ongoing' | 'escalated' | 'deescalated' | 'resolved'

export interface ProviderAlertLifecycleEntry {
  alertId: string
  provider: string
  type: ProviderReliabilityAlert['type']
  state: ProviderAlertLifecycleState
  previousSeverity: ProviderReliabilityAlertSeverity | null
  currentSeverity: ProviderReliabilityAlertSeverity | null
  message: string
}

export interface ProviderAlertLifecycleSnapshot {
  generatedAt: string
  summary: {
    total: number
    opened: number
    ongoing: number
    escalated: number
    deescalated: number
    resolved: number
  }
  entries: ProviderAlertLifecycleEntry[]
  schemaVersion: 'supervisor-provider-alert-lifecycle-v1'
}

const severityRank: Record<ProviderReliabilityAlertSeverity, number> = { info: 0, warning: 1, critical: 2 }
const byId = (snapshot?: ProviderReliabilityAlertSnapshot) => new Map((snapshot?.alerts ?? []).map(alert => [alert.alertId, alert]))

function lifecycleState(previous: ProviderReliabilityAlert | undefined, current: ProviderReliabilityAlert | undefined): ProviderAlertLifecycleState {
  if (!previous && current) return 'opened'
  if (previous && !current) return 'resolved'
  if (!previous || !current) throw new Error('Provider alert lifecycle requires a previous or current alert')
  if (severityRank[current.severity] > severityRank[previous.severity]) return 'escalated'
  if (severityRank[current.severity] < severityRank[previous.severity]) return 'deescalated'
  return 'ongoing'
}

export function createProviderAlertLifecycle(
  current: ProviderReliabilityAlertSnapshot,
  previous?: ProviderReliabilityAlertSnapshot,
  options: { includeOngoing?: boolean; limit?: number } = {},
): ProviderAlertLifecycleSnapshot {
  const currentAlerts = byId(current)
  const previousAlerts = byId(previous)
  const ids = [...new Set([...currentAlerts.keys(), ...previousAlerts.keys()])].sort()
  const includeOngoing = options.includeOngoing ?? true
  const limit = Math.max(0, Math.floor(options.limit ?? 100))

  const entries = ids.flatMap(alertId => {
    const before = previousAlerts.get(alertId)
    const after = currentAlerts.get(alertId)
    const state = lifecycleState(before, after)
    if (state === 'ongoing' && !includeOngoing) return []
    const alert = after ?? before!
    return [{
      alertId,
      provider: alert.provider,
      type: alert.type,
      state,
      previousSeverity: before?.severity ?? null,
      currentSeverity: after?.severity ?? null,
      message: state === 'resolved'
        ? `${alert.provider} reliability alert resolved`
        : state === 'opened'
          ? `${alert.provider} reliability alert opened`
          : state === 'escalated'
            ? `${alert.provider} reliability alert escalated`
            : state === 'deescalated'
              ? `${alert.provider} reliability alert deescalated`
              : `${alert.provider} reliability alert remains active`,
    } satisfies ProviderAlertLifecycleEntry]
  })

  const stateOrder: Record<ProviderAlertLifecycleState, number> = {
    escalated: 0,
    opened: 1,
    ongoing: 2,
    deescalated: 3,
    resolved: 4,
  }
  const ordered = entries
    .sort((a, b) => stateOrder[a.state] - stateOrder[b.state]
      || a.provider.localeCompare(b.provider)
      || a.alertId.localeCompare(b.alertId))
    .slice(0, limit)

  return {
    generatedAt: current.generatedAt,
    summary: {
      total: ordered.length,
      opened: ordered.filter(entry => entry.state === 'opened').length,
      ongoing: ordered.filter(entry => entry.state === 'ongoing').length,
      escalated: ordered.filter(entry => entry.state === 'escalated').length,
      deescalated: ordered.filter(entry => entry.state === 'deescalated').length,
      resolved: ordered.filter(entry => entry.state === 'resolved').length,
    },
    entries: ordered,
    schemaVersion: 'supervisor-provider-alert-lifecycle-v1',
  }
}
