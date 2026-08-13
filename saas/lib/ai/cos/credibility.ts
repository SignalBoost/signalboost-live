export type CredibilityObservation = {
  predictedConfidence: number
  correctness: number
  abstained?: boolean | null
  shouldAbstain?: boolean | null
  provenanceTruthful?: boolean | null
  actionCorrect?: boolean | null
  robustnessGroup?: string | null
  conclusionKey?: string | null
}

export type CalibrationBin = {
  lower: number
  upper: number
  count: number
  meanConfidence: number
  accuracy: number
  gap: number
}

export type CredibilityReport = {
  sampleSize: number
  accuracy: number
  meanConfidence: number
  brierScore: number
  logLoss: number
  expectedCalibrationError: number
  maximumCalibrationError: number
  confidenceBias: number
  bins: CalibrationBin[]
  abstention: {
    evaluated: number
    coverage: number | null
    selectiveAccuracy: number | null
    appropriateAbstentionRate: number | null
    falseAbstentionRate: number | null
  }
  provenance: { evaluated: number; truthfulRate: number | null }
  actions: { evaluated: number; correctnessRate: number | null }
  robustness: { groups: number; observations: number; consistencyRate: number | null }
}

function clamp01(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(1, numeric))
}

function round(value: number, digits = 6): number {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function nullableRate(numerator: number, denominator: number): number | null {
  return denominator ? round(numerator / denominator) : null
}

export function calibrationBins(observations: CredibilityObservation[], binCount = 10): CalibrationBin[] {
  const count = Math.max(2, Math.min(50, Math.floor(binCount || 10)))
  const bins: CalibrationBin[] = []
  for (let index = 0; index < count; index += 1) {
    const lower = index / count
    const upper = (index + 1) / count
    const rows = observations.filter((row) => {
      const confidence = clamp01(row.predictedConfidence)
      return index === count - 1 ? confidence >= lower && confidence <= upper : confidence >= lower && confidence < upper
    })
    if (!rows.length) continue
    const meanConfidence = mean(rows.map((row) => clamp01(row.predictedConfidence)))
    const accuracy = mean(rows.map((row) => clamp01(row.correctness)))
    bins.push({
      lower: round(lower, 4),
      upper: round(upper, 4),
      count: rows.length,
      meanConfidence: round(meanConfidence),
      accuracy: round(accuracy),
      gap: round(Math.abs(meanConfidence - accuracy)),
    })
  }
  return bins
}

export function brierScore(observations: CredibilityObservation[]): number {
  if (!observations.length) return 0
  return round(mean(observations.map((row) => {
    const delta = clamp01(row.predictedConfidence) - clamp01(row.correctness)
    return delta * delta
  })))
}

export function logLoss(observations: CredibilityObservation[]): number {
  if (!observations.length) return 0
  const epsilon = 1e-15
  return round(mean(observations.map((row) => {
    const confidence = Math.max(epsilon, Math.min(1 - epsilon, clamp01(row.predictedConfidence)))
    const outcome = clamp01(row.correctness)
    return -(outcome * Math.log(confidence) + (1 - outcome) * Math.log(1 - confidence))
  })))
}

export function expectedCalibrationError(observations: CredibilityObservation[], binCount = 10): number {
  if (!observations.length) return 0
  return round(calibrationBins(observations, binCount)
    .reduce((sum, bin) => sum + (bin.count / observations.length) * bin.gap, 0))
}

export function maximumCalibrationError(observations: CredibilityObservation[], binCount = 10): number {
  const gaps = calibrationBins(observations, binCount).map((bin) => bin.gap)
  return round(gaps.length ? Math.max(...gaps) : 0)
}

export function credibilityReport(observations: CredibilityObservation[], binCount = 10): CredibilityReport {
  const normalized = observations.map((row) => ({
    ...row,
    predictedConfidence: clamp01(row.predictedConfidence),
    correctness: clamp01(row.correctness),
  }))
  const sampleSize = normalized.length
  const accuracy = mean(normalized.map((row) => row.correctness))
  const meanConfidence = mean(normalized.map((row) => row.predictedConfidence))

  const abstentionRows = normalized.filter((row) => typeof row.abstained === 'boolean' && typeof row.shouldAbstain === 'boolean')
  const answeredRows = abstentionRows.filter((row) => row.abstained === false)
  const shouldAbstainRows = abstentionRows.filter((row) => row.shouldAbstain === true)
  const shouldAnswerRows = abstentionRows.filter((row) => row.shouldAbstain === false)

  const provenanceRows = normalized.filter((row) => typeof row.provenanceTruthful === 'boolean')
  const actionRows = normalized.filter((row) => typeof row.actionCorrect === 'boolean')

  const robustnessGroups = new Map<string, CredibilityObservation[]>()
  for (const row of normalized) {
    const group = String(row.robustnessGroup || '').trim()
    const conclusion = String(row.conclusionKey || '').trim()
    if (!group || !conclusion) continue
    const current = robustnessGroups.get(group) || []
    current.push(row)
    robustnessGroups.set(group, current)
  }
  let robustObservations = 0
  let robustAgreements = 0
  let robustGroupCount = 0
  for (const rows of robustnessGroups.values()) {
    if (rows.length < 2) continue
    robustGroupCount += 1
    robustObservations += rows.length
    const counts = new Map<string, number>()
    for (const row of rows) {
      const key = String(row.conclusionKey)
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    robustAgreements += Math.max(...counts.values())
  }

  return {
    sampleSize,
    accuracy: round(accuracy),
    meanConfidence: round(meanConfidence),
    brierScore: brierScore(normalized),
    logLoss: logLoss(normalized),
    expectedCalibrationError: expectedCalibrationError(normalized, binCount),
    maximumCalibrationError: maximumCalibrationError(normalized, binCount),
    confidenceBias: round(meanConfidence - accuracy),
    bins: calibrationBins(normalized, binCount),
    abstention: {
      evaluated: abstentionRows.length,
      coverage: abstentionRows.length ? nullableRate(answeredRows.length, abstentionRows.length) : null,
      selectiveAccuracy: answeredRows.length ? round(mean(answeredRows.map((row) => row.correctness))) : null,
      appropriateAbstentionRate: shouldAbstainRows.length
        ? nullableRate(shouldAbstainRows.filter((row) => row.abstained === true).length, shouldAbstainRows.length)
        : null,
      falseAbstentionRate: shouldAnswerRows.length
        ? nullableRate(shouldAnswerRows.filter((row) => row.abstained === true).length, shouldAnswerRows.length)
        : null,
    },
    provenance: {
      evaluated: provenanceRows.length,
      truthfulRate: provenanceRows.length
        ? nullableRate(provenanceRows.filter((row) => row.provenanceTruthful === true).length, provenanceRows.length)
        : null,
    },
    actions: {
      evaluated: actionRows.length,
      correctnessRate: actionRows.length
        ? nullableRate(actionRows.filter((row) => row.actionCorrect === true).length, actionRows.length)
        : null,
    },
    robustness: {
      groups: robustGroupCount,
      observations: robustObservations,
      consistencyRate: robustObservations ? round(robustAgreements / robustObservations) : null,
    },
  }
}

export type EmpiricalCalibrationPoint = {
  rawConfidence: number
  calibratedProbability: number
  samples: number
}

/**
 * Pool-adjacent-violators isotonic calibration. This learns a monotonic mapping from COS's
 * raw confidence to observed correctness without arbitrary +/− confidence bonuses.
 * Keep fitting and evaluation on separate datasets; fitting and scoring on the same cases is optimistic.
 */
export function fitIsotonicCalibration(observations: CredibilityObservation[]): EmpiricalCalibrationPoint[] {
  const grouped = new Map<number, { sum: number; count: number }>()
  for (const row of observations) {
    const confidence = clamp01(row.predictedConfidence)
    const bucket = grouped.get(confidence) || { sum: 0, count: 0 }
    bucket.sum += clamp01(row.correctness)
    bucket.count += 1
    grouped.set(confidence, bucket)
  }
  const blocks = [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([rawConfidence, stats]) => ({
      low: rawConfidence,
      high: rawConfidence,
      sum: stats.sum,
      count: stats.count,
    }))

  for (let index = 0; index < blocks.length - 1;) {
    const left = blocks[index]
    const right = blocks[index + 1]
    if ((left.sum / left.count) <= (right.sum / right.count)) {
      index += 1
      continue
    }
    blocks.splice(index, 2, {
      low: left.low,
      high: right.high,
      sum: left.sum + right.sum,
      count: left.count + right.count,
    })
    if (index > 0) index -= 1
  }

  const points: EmpiricalCalibrationPoint[] = []
  for (const block of blocks) {
    const calibratedProbability = round(block.sum / block.count)
    for (const [rawConfidence, stats] of [...grouped.entries()].sort(([left], [right]) => left - right)) {
      if (rawConfidence < block.low || rawConfidence > block.high) continue
      points.push({ rawConfidence, calibratedProbability, samples: stats.count })
    }
  }
  return points.sort((left, right) => left.rawConfidence - right.rawConfidence)
}

export function applyIsotonicCalibration(rawConfidence: number, points: EmpiricalCalibrationPoint[]): number | null {
  if (!points.length) return null
  const confidence = clamp01(rawConfidence)
  let best = points[0]
  let distance = Math.abs(confidence - best.rawConfidence)
  for (const point of points.slice(1)) {
    const nextDistance = Math.abs(confidence - point.rawConfidence)
    if (nextDistance < distance || (nextDistance === distance && point.rawConfidence < best.rawConfidence)) {
      best = point
      distance = nextDistance
    }
  }
  return best.calibratedProbability
}
