import type { SupervisorMetrics, SupervisorProviderMetric } from '../metrics/index.ts'

export type ProviderPerformanceState = 'healthy' | 'warning' | 'critical' | 'unknown'

export interface ProviderPerformanceRow {
  provider: string
  events: number
  successes: number
  failures: number
  successRate: number | null
  failureRate: number | null
  state: ProviderPerformanceState
  rank: number
  evidence: string[]
}

export interface ProviderPerformanceDashboard {
  generatedAt: string
  window: SupervisorMetrics['window']
  summary: {
    providers: number
    healthy: number
    warning: number
    critical: number
    unknown: number
    totalAttempts: number
    totalSuccesses: number
    totalFailures: number
    overallSuccessRate: number | null
  }
  providers: ProviderPerformanceRow[]
  schemaVersion: 'supervisor-provider-performance-v1'
}

const percent = (value: number, total: number) => total === 0 ? null : Math.round((value / total) * 10_000) / 100

function classify(metric: SupervisorProviderMetric, minimumAttempts: number): ProviderPerformanceState {
  const attempts = metric.successes + metric.failures
  if (attempts < minimumAttempts || metric.successRate === null) return 'unknown'
  if (metric.successRate >= 95) return 'healthy'
  if (metric.successRate >= 80) return 'warning'
  return 'critical'
}

export function createProviderPerformanceDashboard(
  metrics: SupervisorMetrics,
  options: { minimumAttempts?: number; limit?: number } = {},
): ProviderPerformanceDashboard {
  const minimumAttempts = Math.max(1, Math.floor(options.minimumAttempts ?? 3))
  const limit = Math.max(0, Math.floor(options.limit ?? 50))

  const ordered = metrics.providers
    .map(metric => {
      const attempts = metric.successes + metric.failures
      const state = classify(metric, minimumAttempts)
      const evidence = [
        `${metric.events} events`,
        `${attempts} measured attempts`,
        `${metric.successes} successes`,
        `${metric.failures} failures`,
      ]
      return {
        provider: metric.provider,
        events: metric.events,
        successes: metric.successes,
        failures: metric.failures,
        successRate: metric.successRate,
        failureRate: percent(metric.failures, attempts),
        state,
        rank: 0,
        evidence,
      } satisfies ProviderPerformanceRow
    })
    .sort((a, b) => {
      const stateOrder: Record<ProviderPerformanceState, number> = { critical: 0, warning: 1, unknown: 2, healthy: 3 }
      return stateOrder[a.state] - stateOrder[b.state]
        || (a.successRate ?? -1) - (b.successRate ?? -1)
        || b.failures - a.failures
        || a.provider.localeCompare(b.provider)
    })
    .slice(0, limit)
    .map((provider, index) => ({ ...provider, rank: index + 1 }))

  const totalSuccesses = ordered.reduce((sum, provider) => sum + provider.successes, 0)
  const totalFailures = ordered.reduce((sum, provider) => sum + provider.failures, 0)
  const totalAttempts = totalSuccesses + totalFailures

  return {
    generatedAt: metrics.generatedAt,
    window: metrics.window,
    summary: {
      providers: ordered.length,
      healthy: ordered.filter(provider => provider.state === 'healthy').length,
      warning: ordered.filter(provider => provider.state === 'warning').length,
      critical: ordered.filter(provider => provider.state === 'critical').length,
      unknown: ordered.filter(provider => provider.state === 'unknown').length,
      totalAttempts,
      totalSuccesses,
      totalFailures,
      overallSuccessRate: percent(totalSuccesses, totalAttempts),
    },
    providers: ordered,
    schemaVersion: 'supervisor-provider-performance-v1',
  }
}