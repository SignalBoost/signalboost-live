import type { ProviderAlertHistorySnapshot, ProviderReliabilityTrendSummary } from '../provider-alert-history/index.ts'

export type ProviderReliabilityForecastTrend = 'improving' | 'stable' | 'degrading'
export type ProviderReliabilityForecastRisk = 'low' | 'moderate' | 'high' | 'critical'

export interface ProviderReliabilityForecast {
  provider: string
  trend: ProviderReliabilityForecastTrend
  riskLevel: ProviderReliabilityForecastRisk
  recurrenceScore: number
  stabilityScore: number
  confidenceScore: number
  activeAlerts: number
  alertOccurrences: number
  lastObservedAt: string
}

export interface ProviderReliabilityForecastSnapshot {
  generatedAt: string
  summary: {
    total: number
    improving: number
    stable: number
    degrading: number
    highRisk: number
    criticalRisk: number
  }
  forecasts: ProviderReliabilityForecast[]
  schemaVersion: 'supervisor-provider-reliability-forecast-v1'
}

const MAX_RESULTS = 250
const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

function recurrenceScore(trend: ProviderReliabilityTrendSummary): number {
  return clamp((trend.alertOccurrences - 1) * 18 + trend.activeAlerts * 22 + trend.escalationCount * 12)
}

function classifyTrend(trend: ProviderReliabilityTrendSummary): ProviderReliabilityForecastTrend {
  const pressure = trend.activeAlerts * 2 + trend.escalationCount - trend.deescalationCount - trend.resolvedAlerts
  if (pressure >= 2) return 'degrading'
  if (pressure <= -2) return 'improving'
  return 'stable'
}

function riskLevel(score: number, activeAlerts: number): ProviderReliabilityForecastRisk {
  if (score >= 75 || activeAlerts >= 3) return 'critical'
  if (score >= 50 || activeAlerts >= 2) return 'high'
  if (score >= 25 || activeAlerts >= 1) return 'moderate'
  return 'low'
}

function confidenceScore(trend: ProviderReliabilityTrendSummary): number {
  const evidence = Math.min(60, trend.alertOccurrences * 12)
  const transitions = Math.min(25, (trend.escalationCount + trend.deescalationCount) * 5)
  const resolutionEvidence = trend.resolvedAlerts > 0 ? 15 : 0
  return clamp(evidence + transitions + resolutionEvidence)
}

export function createProviderReliabilityForecast(
  history: ProviderAlertHistorySnapshot,
  options: { limit?: number } = {},
): ProviderReliabilityForecastSnapshot {
  const limit = Math.min(MAX_RESULTS, Math.max(0, Math.floor(options.limit ?? 100)))
  const forecasts = history.providerTrends.map(providerTrend => {
    const recurrence = recurrenceScore(providerTrend)
    const trend = classifyTrend(providerTrend)
    const activePressure = providerTrend.activeAlerts * 15
    const escalationPressure = providerTrend.escalationCount * 8
    const recoveryCredit = providerTrend.deescalationCount * 5 + providerTrend.resolvedAlerts * 4
    const riskScore = clamp(recurrence + activePressure + escalationPressure - recoveryCredit)
    return {
      provider: providerTrend.provider,
      trend,
      riskLevel: riskLevel(riskScore, providerTrend.activeAlerts),
      recurrenceScore: recurrence,
      stabilityScore: clamp(100 - riskScore),
      confidenceScore: confidenceScore(providerTrend),
      activeAlerts: providerTrend.activeAlerts,
      alertOccurrences: providerTrend.alertOccurrences,
      lastObservedAt: providerTrend.lastObservedAt,
    } satisfies ProviderReliabilityForecast
  }).sort((a, b) => {
    const riskRank: Record<ProviderReliabilityForecastRisk, number> = { critical: 0, high: 1, moderate: 2, low: 3 }
    return riskRank[a.riskLevel] - riskRank[b.riskLevel]
      || a.stabilityScore - b.stabilityScore
      || a.provider.localeCompare(b.provider)
  }).slice(0, limit)

  return {
    generatedAt: history.generatedAt,
    summary: {
      total: forecasts.length,
      improving: forecasts.filter(item => item.trend === 'improving').length,
      stable: forecasts.filter(item => item.trend === 'stable').length,
      degrading: forecasts.filter(item => item.trend === 'degrading').length,
      highRisk: forecasts.filter(item => item.riskLevel === 'high').length,
      criticalRisk: forecasts.filter(item => item.riskLevel === 'critical').length,
    },
    forecasts,
    schemaVersion: 'supervisor-provider-reliability-forecast-v1',
  }
}
