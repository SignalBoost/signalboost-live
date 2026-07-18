// Deterministic confidence calibration from predicted confidence and measured outcomes.

export type ConfidenceCalibration = {
  predictedConfidence: number
  observedPerformance: number
  calibrationError: number
  calibratedConfidence: number
  direction: 'underconfident' | 'overconfident' | 'aligned'
}

function clamp01(value: unknown): number {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.min(1, Math.max(0, number))
}

export function averageConfidence(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0
  const scores = Object.values(value as Record<string, unknown>)
    .map(clamp01)
    .filter(score => score > 0)
  if (!scores.length) return 0
  return Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10000) / 10000
}

export function calibrateConfidence(predicted: unknown, observed: unknown): ConfidenceCalibration {
  const predictedConfidence = clamp01(predicted)
  const observedPerformance = clamp01(observed)
  const signedError = observedPerformance - predictedConfidence
  const calibrationError = Math.round(Math.abs(signedError) * 10000) / 10000
  const calibratedConfidence = Math.round((predictedConfidence * 0.75 + observedPerformance * 0.25) * 10000) / 10000
  const direction = Math.abs(signedError) <= 0.05
    ? 'aligned'
    : signedError > 0
      ? 'underconfident'
      : 'overconfident'
  return {
    predictedConfidence,
    observedPerformance,
    calibrationError,
    calibratedConfidence,
    direction,
  }
}
