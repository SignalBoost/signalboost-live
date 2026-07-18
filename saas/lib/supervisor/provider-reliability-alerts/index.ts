import type { ProviderPerformanceDashboard, ProviderPerformanceRow } from '../provider-performance/index.ts'

export type ProviderReliabilityAlertSeverity = 'critical' | 'warning' | 'info'
export type ProviderReliabilityAlertType = 'critical_provider' | 'warning_provider' | 'insufficient_data' | 'success_rate_drop'

export interface ProviderReliabilityAlert {
  alertId: string
  provider: string
  type: ProviderReliabilityAlertType
  severity: ProviderReliabilityAlertSeverity
  message: string
  currentSuccessRate: number | null
  previousSuccessRate: number | null
  deltaPercentagePoints: number | null
  evidence: string[]
}

export interface ProviderReliabilityAlertSnapshot {
  generatedAt: string
  window: ProviderPerformanceDashboard['window']
  summary: {
    total: number
    critical: number
    warning: number
    info: number
    providersAffected: number
  }
  alerts: ProviderReliabilityAlert[]
  schemaVersion: 'supervisor-provider-reliability-alerts-v1'
}

const round = (value: number) => Math.round(value * 100) / 100
const alertId = (provider: string, type: ProviderReliabilityAlertType) => `${provider}:${type}`

function byProvider(rows: ProviderPerformanceRow[]) {
  return new Map(rows.map(row => [row.provider, row]))
}

export function createProviderReliabilityAlerts(
  current: ProviderPerformanceDashboard,
  options: {
    previous?: ProviderPerformanceDashboard
    minimumDropPercentagePoints?: number
    includeUnknown?: boolean
    limit?: number
  } = {},
): ProviderReliabilityAlertSnapshot {
  const minimumDrop = Math.max(0, options.minimumDropPercentagePoints ?? 10)
  const limit = Math.max(0, Math.floor(options.limit ?? 50))
  const previous = options.previous ? byProvider(options.previous.providers) : new Map<string, ProviderPerformanceRow>()
  const alerts: ProviderReliabilityAlert[] = []

  for (const provider of current.providers) {
    const previousProvider = previous.get(provider.provider)
    const previousSuccessRate = previousProvider?.successRate ?? null
    const delta = provider.successRate !== null && previousSuccessRate !== null
      ? round(provider.successRate - previousSuccessRate)
      : null

    if (provider.state === 'critical') {
      alerts.push({
        alertId: alertId(provider.provider, 'critical_provider'),
        provider: provider.provider,
        type: 'critical_provider',
        severity: 'critical',
        message: `${provider.provider} reliability is critical`,
        currentSuccessRate: provider.successRate,
        previousSuccessRate,
        deltaPercentagePoints: delta,
        evidence: provider.evidence,
      })
    } else if (provider.state === 'warning') {
      alerts.push({
        alertId: alertId(provider.provider, 'warning_provider'),
        provider: provider.provider,
        type: 'warning_provider',
        severity: 'warning',
        message: `${provider.provider} reliability requires attention`,
        currentSuccessRate: provider.successRate,
        previousSuccessRate,
        deltaPercentagePoints: delta,
        evidence: provider.evidence,
      })
    } else if (provider.state === 'unknown' && options.includeUnknown) {
      alerts.push({
        alertId: alertId(provider.provider, 'insufficient_data'),
        provider: provider.provider,
        type: 'insufficient_data',
        severity: 'info',
        message: `${provider.provider} does not have enough measured attempts`,
        currentSuccessRate: provider.successRate,
        previousSuccessRate,
        deltaPercentagePoints: delta,
        evidence: provider.evidence,
      })
    }

    if (delta !== null && delta <= -minimumDrop) {
      alerts.push({
        alertId: alertId(provider.provider, 'success_rate_drop'),
        provider: provider.provider,
        type: 'success_rate_drop',
        severity: delta <= -(minimumDrop * 2) ? 'critical' : 'warning',
        message: `${provider.provider} success rate dropped by ${Math.abs(delta)} percentage points`,
        currentSuccessRate: provider.successRate,
        previousSuccessRate,
        deltaPercentagePoints: delta,
        evidence: [`previous ${previousSuccessRate}%`, `current ${provider.successRate}%`, ...provider.evidence],
      })
    }
  }

  const severityOrder: Record<ProviderReliabilityAlertSeverity, number> = { critical: 0, warning: 1, info: 2 }
  const ordered = alerts
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]
      || (a.currentSuccessRate ?? -1) - (b.currentSuccessRate ?? -1)
      || a.provider.localeCompare(b.provider)
      || a.type.localeCompare(b.type))
    .slice(0, limit)

  return {
    generatedAt: current.generatedAt,
    window: current.window,
    summary: {
      total: ordered.length,
      critical: ordered.filter(alert => alert.severity === 'critical').length,
      warning: ordered.filter(alert => alert.severity === 'warning').length,
      info: ordered.filter(alert => alert.severity === 'info').length,
      providersAffected: new Set(ordered.map(alert => alert.provider)).size,
    },
    alerts: ordered,
    schemaVersion: 'supervisor-provider-reliability-alerts-v1',
  }
}
