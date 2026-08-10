import type { RevenueIntelligenceSnapshot } from './types.ts'

export type RevenueOptimizationSignal = {
  id: string
  kind: 'conversion' | 'pipeline' | 'roi' | 'forecast' | 'sales_cycle'
  metric: string
  value: number
  unit: 'ratio' | 'currency' | 'days'
  currency?: string
  evidenceRefs: readonly string[]
}

export function buildRevenueOptimizationSignals(snapshot: RevenueIntelligenceSnapshot): RevenueOptimizationSignal[] {
  const signals: RevenueOptimizationSignal[] = [
    {
      id: 'revenue:reply-rate',
      kind: 'conversion',
      metric: 'reply_rate',
      value: snapshot.funnel.replyRate,
      unit: 'ratio',
      evidenceRefs: snapshot.evidenceRefs,
    },
    {
      id: 'revenue:meeting-rate',
      kind: 'conversion',
      metric: 'meeting_rate',
      value: snapshot.funnel.meetingRate,
      unit: 'ratio',
      evidenceRefs: snapshot.evidenceRefs,
    },
    {
      id: 'revenue:win-rate',
      kind: 'conversion',
      metric: 'win_rate',
      value: snapshot.funnel.winRate,
      unit: 'ratio',
      evidenceRefs: snapshot.evidenceRefs,
    },
  ]

  if (snapshot.averageSalesCycleDays !== null) {
    signals.push({
      id: 'revenue:sales-cycle-days',
      kind: 'sales_cycle',
      metric: 'average_sales_cycle_days',
      value: snapshot.averageSalesCycleDays,
      unit: 'days',
      evidenceRefs: snapshot.evidenceRefs,
    })
  }

  for (const row of snapshot.currencies) {
    signals.push({ id: `revenue:${row.currency}:pipeline`, kind: 'pipeline', metric: 'open_pipeline_value', value: row.openPipelineValue, unit: 'currency', currency: row.currency, evidenceRefs: snapshot.evidenceRefs })
    if (row.roi !== null) signals.push({ id: `revenue:${row.currency}:roi`, kind: 'roi', metric: 'roi', value: row.roi, unit: 'ratio', currency: row.currency, evidenceRefs: snapshot.evidenceRefs })
  }

  for (const forecast of snapshot.forecasts) {
    signals.push({ id: `revenue:${forecast.currency}:forecast`, kind: 'forecast', metric: 'probability_adjusted_forecast', value: forecast.probabilityAdjustedForecast, unit: 'currency', currency: forecast.currency, evidenceRefs: snapshot.evidenceRefs })
  }

  return signals
}
