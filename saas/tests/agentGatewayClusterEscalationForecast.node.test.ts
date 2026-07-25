import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateClusterEscalationForecast } from '../agent-gateway/cluster-escalation-forecast.ts'
import type { ClusterEscalationTrendAnalysis } from '../agent-gateway/cluster-escalation-trends.ts'

function analysis(scores: number[]): ClusterEscalationTrendAnalysis {
  const points = scores.map((pressureScore, index) => Object.freeze({ schemaVersion: 'agent-gateway-cluster-escalation-trend-point-v1' as const, generatedAt: `2026-07-25T23:0${index}:00.000Z`, activeRecommendations: pressureScore, recurringRecommendations: index ? 1 : 0, incidentRecommendations: pressureScore >= 12 ? 1 : 0, executiveRecommendations: pressureScore >= 24 ? 1 : 0, pressureScore, readOnly: true as const, executable: false as const }))
  return Object.freeze({ schemaVersion: 'agent-gateway-cluster-escalation-trend-analysis-v1', clusterId: 'cluster-a', generatedAt: points.at(-1)?.generatedAt ?? new Date(0).toISOString(), trend: scores.length < 2 ? 'unknown' : 'rising', delta: scores.length > 1 ? scores.at(-1)! - scores[0] : 0, recurringPressure: scores.length > 1, incidentPressure: scores.some(value => value >= 12), executivePressure: scores.some(value => value >= 24), points: Object.freeze(points), notificationsEnabled: false, automaticRemediationEnabled: false, readOnly: true, executable: false })
}

test('forecasts rising escalation pressure without decisions or remediation', () => {
  const forecast = evaluateClusterEscalationForecast({ analysis: analysis([6, 12, 20]) })
  assert.equal(forecast.direction, 'rising')
  assert.equal(forecast.projectedPressureScore, 27)
  assert.equal(forecast.risk, 'critical')
  assert.equal(forecast.automatedDecisionEnabled, false)
  assert.equal(forecast.notificationsEnabled, false)
  assert.equal(forecast.automaticRemediationEnabled, false)
  assert.equal(forecast.executable, false)
})

test('reports unknown confidence from an empty analysis and rejects invalid policy', () => {
  assert.equal(evaluateClusterEscalationForecast({ analysis: analysis([]) }).risk, 'unknown')
  assert.throws(() => evaluateClusterEscalationForecast({ analysis: analysis([1, 2]), policy: { criticalPressureThreshold: 4, highPressureThreshold: 5 } }), /critical threshold/)
})
