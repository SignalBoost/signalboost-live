import type { CosPriority, CosSignal } from './types'

export type RecommendationScoreInput = {
  impact?: number
  urgency?: number
  revenue?: number
  confidence?: number
  risk?: number
  cost?: number
  strategicValue?: number
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

export function scoreRecommendation(input: RecommendationScoreInput): number {
  const impact = clamp(input.impact ?? 50)
  const urgency = clamp(input.urgency ?? 40)
  const revenue = clamp(input.revenue ?? 35)
  const confidence = clamp(input.confidence ?? 50)
  const risk = clamp(input.risk ?? 30)
  const cost = clamp(input.cost ?? 20)
  const strategicValue = clamp(input.strategicValue ?? 50)

  return Math.round(
    impact * 0.24 +
    urgency * 0.16 +
    revenue * 0.2 +
    confidence * 0.16 +
    strategicValue * 0.16 -
    risk * 0.05 -
    cost * 0.03,
  )
}

export function priorityFromScore(score: number): CosPriority {
  if (score >= 85) return 'critical'
  if (score >= 70) return 'high'
  if (score >= 45) return 'medium'
  return 'low'
}

export function scoreSignals(signals: CosSignal[]): RecommendationScoreInput {
  const changes = signals.map(signal => typeof signal.change === 'number' ? signal.change : 0)
  const positiveChange = changes.filter(value => value > 0).reduce((sum, value) => sum + value, 0)
  const avgConfidence = signals.length
    ? signals.reduce((sum, signal) => sum + (signal.confidence ?? 50), 0) / signals.length
    : 50

  return {
    impact: Math.min(100, 45 + positiveChange),
    urgency: signals.some(signal => String(signal.metric).toLowerCase().includes('drop')) ? 75 : 50,
    revenue: signals.some(signal => String(signal.metric).toLowerCase().includes('conversion') || String(signal.metric).toLowerCase().includes('revenue')) ? 80 : 45,
    confidence: avgConfidence,
    risk: 25,
    cost: 20,
    strategicValue: 65,
  }
}
