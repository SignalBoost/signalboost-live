import type { SupervisorTimelineEvent } from '../event-timeline/index.ts'

export const supervisorMetricWindows = ['1h', '24h', '7d', '30d'] as const
export type SupervisorMetricWindow = typeof supervisorMetricWindows[number]

export interface SupervisorProviderMetric {
  provider: string
  events: number
  successes: number
  failures: number
  successRate: number | null
}

export interface SupervisorMetrics {
  generatedAt: string
  window: SupervisorMetricWindow
  windowStart: string
  windowEnd: string
  totals: {
    events: number
    incidents: number
    criticalEvents: number
    queueCompleted: number
    retries: number
    approvalsRequested: number
    approvalsCompleted: number
    killSwitchActivations: number
  }
  latencyMs: {
    meanTimeToDetect: number | null
    meanTimeToRepair: number | null
    meanApprovalLatency: number | null
  }
  providers: SupervisorProviderMetric[]
  eventsByKind: Record<string, number>
  eventsBySeverity: Record<string, number>
  schemaVersion: 'supervisor-metrics-v1'
}

const windowDurationMs: Record<SupervisorMetricWindow, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

const normalizedAction = (event: SupervisorTimelineEvent) => event.action.trim().toLowerCase().replace(/[\s-]+/g, '_')
const isOneOf = (action: string, values: readonly string[]) => values.includes(action)
const average = (values: number[]) => values.length === 0 ? null : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
const ratio = (successes: number, attempts: number) => attempts === 0 ? null : Math.round((successes / attempts) * 10_000) / 100

const detectionActions = ['detected', 'incident_detected', 'opened', 'incident_opened']
const repairActions = ['resolved', 'incident_resolved', 'repaired', 'incident_repaired', 'closed', 'incident_closed']
const sourceActions = ['observed', 'observation_created', 'trigger_received', 'incident_triggered']
const approvalRequestedActions = ['approval_requested', 'requested']
const approvalCompletedActions = ['approval_approved', 'approved', 'approval_rejected', 'rejected']
const successActions = ['succeeded', 'success', 'completed', 'healthy', 'recovered']
const failureActions = ['failed', 'failure', 'unhealthy', 'degraded', 'timed_out', 'timeout']

function durationsBetween(
  events: SupervisorTimelineEvent[],
  starts: readonly string[],
  ends: readonly string[],
  key: (event: SupervisorTimelineEvent) => string | undefined,
): number[] {
  const grouped = new Map<string, SupervisorTimelineEvent[]>()
  for (const event of events) {
    const id = key(event)
    if (!id) continue
    grouped.set(id, [...(grouped.get(id) ?? []), event])
  }

  const durations: number[] = []
  for (const group of grouped.values()) {
    const ordered = [...group].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
    const start = ordered.find(event => isOneOf(normalizedAction(event), starts))
    const end = start && ordered.find(event => Date.parse(event.occurredAt) >= Date.parse(start.occurredAt) && isOneOf(normalizedAction(event), ends))
    if (start && end) durations.push(Date.parse(end.occurredAt) - Date.parse(start.occurredAt))
  }
  return durations
}

export function createSupervisorMetrics(
  events: SupervisorTimelineEvent[],
  options: { window?: SupervisorMetricWindow; now?: string | Date } = {},
): SupervisorMetrics {
  const window = options.window ?? '24h'
  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now())
  if (!Number.isFinite(now.getTime())) throw new Error('Supervisor metrics require a valid now timestamp')

  const windowEndMs = now.getTime()
  const windowStartMs = windowEndMs - windowDurationMs[window]
  const selected = events.filter(event => {
    const occurredAt = Date.parse(event.occurredAt)
    return Number.isFinite(occurredAt) && occurredAt >= windowStartMs && occurredAt <= windowEndMs
  })

  const eventsByKind: Record<string, number> = {}
  const eventsBySeverity: Record<string, number> = {}
  const providers = new Map<string, { events: number; successes: number; failures: number }>()

  for (const event of selected) {
    eventsByKind[event.kind] = (eventsByKind[event.kind] ?? 0) + 1
    eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] ?? 0) + 1
    if (event.provider) {
      const metric = providers.get(event.provider) ?? { events: 0, successes: 0, failures: 0 }
      metric.events += 1
      const action = normalizedAction(event)
      if (isOneOf(action, successActions)) metric.successes += 1
      if (isOneOf(action, failureActions)) metric.failures += 1
      providers.set(event.provider, metric)
    }
  }

  const actionCount = (actions: readonly string[], kind?: SupervisorTimelineEvent['kind']) => selected.filter(event =>
    (!kind || event.kind === kind) && isOneOf(normalizedAction(event), actions),
  ).length

  return {
    generatedAt: now.toISOString(),
    window,
    windowStart: new Date(windowStartMs).toISOString(),
    windowEnd: now.toISOString(),
    totals: {
      events: selected.length,
      incidents: new Set(selected.map(event => event.incidentId).filter((value): value is string => Boolean(value))).size,
      criticalEvents: selected.filter(event => event.severity === 'critical').length,
      queueCompleted: actionCount(['completed', 'work_item_completed'], 'work_item'),
      retries: selected.reduce((sum, event) => sum + (typeof event.metadata.retryCount === 'number' ? event.metadata.retryCount : normalizedAction(event) === 'retried' ? 1 : 0), 0),
      approvalsRequested: actionCount(approvalRequestedActions, 'approval'),
      approvalsCompleted: actionCount(approvalCompletedActions, 'approval'),
      killSwitchActivations: actionCount(['activated', 'kill_switch_activated', 'enabled'], 'kill_switch'),
    },
    latencyMs: {
      meanTimeToDetect: average(durationsBetween(selected, sourceActions, detectionActions, event => event.incidentId ?? event.correlationId)),
      meanTimeToRepair: average(durationsBetween(selected, detectionActions, repairActions, event => event.incidentId)),
      meanApprovalLatency: average(durationsBetween(selected, approvalRequestedActions, approvalCompletedActions, event => event.correlationId ?? event.incidentId ?? event.sourceId)),
    },
    providers: [...providers.entries()]
      .map(([provider, metric]) => ({
        provider,
        ...metric,
        successRate: ratio(metric.successes, metric.successes + metric.failures),
      }))
      .sort((a, b) => a.provider.localeCompare(b.provider)),
    eventsByKind: Object.fromEntries(Object.entries(eventsByKind).sort(([a], [b]) => a.localeCompare(b))),
    eventsBySeverity: Object.fromEntries(Object.entries(eventsBySeverity).sort(([a], [b]) => a.localeCompare(b))),
    schemaVersion: 'supervisor-metrics-v1',
  }
}
