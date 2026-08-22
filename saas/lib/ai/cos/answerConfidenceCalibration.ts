export type CalibrationSample = { predicted: number; observed: boolean }
export type CalibrationBucket = {
  lowerBound: number; upperBound: number; samples: number; successes: number
  meanPredicted: number | null; observedRate: number | null; gap: number | null
  verdict: CalibrationVerdict
}
export type CalibrationVerdict = 'overconfident' | 'underconfident' | 'aligned' | 'insufficient_evidence'
export type CalibrationReport = {
  samples: number; overallGap: number | null; buckets: CalibrationBucket[]
  falseConfidenceRate: number | null; missedAnswerRate: number | null
  verdict: CalibrationVerdict; summary: string
}
export type CalibrationCohortSample = CalibrationSample & {
  problemClass?: string | null
  reasonerLabel?: string | null
  evidenceRegime?: string | null
}
export type CalibrationCohort = {
  dimension: 'problem_class' | 'reasoner' | 'evidence_regime'
  key: string
  report: CalibrationReport
  shadowRecommendation: { eligible: boolean; threshold: number | null; reason: string }
}

export const MINIMUM_SAMPLES_PER_BUCKET = 10
export const MINIMUM_SAMPLES_OVERALL = 30
export const ALIGNMENT_TOLERANCE = 0.05
const round = (value: number, places = 4) => Math.round(value * 10 ** places) / 10 ** places
const clamp01 = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : 0
function verdictFor(gap: number | null, samples: number, minimum: number): CalibrationVerdict {
  if (gap === null || samples < minimum) return 'insufficient_evidence'
  if (Math.abs(gap) <= ALIGNMENT_TOLERANCE) return 'aligned'
  return gap < 0 ? 'overconfident' : 'underconfident'
}

export function calibrateAnswerConfidence(input: readonly CalibrationSample[], threshold = 0.72): CalibrationReport {
  const clean = (Array.isArray(input) ? input : []).map(sample => ({ predicted: clamp01(sample?.predicted), observed: sample?.observed === true }))
  const buckets = Array.from({ length: 10 }, (_, index) => {
    const lowerBound = index / 10
    const upperBound = round(lowerBound + 0.1, 2)
    const rows = clean.filter(row => row.predicted >= lowerBound && (upperBound === 1 ? row.predicted <= 1 : row.predicted < upperBound))
    const successes = rows.filter(row => row.observed).length
    const meanPredicted = rows.length ? round(rows.reduce((sum, row) => sum + row.predicted, 0) / rows.length) : null
    const observedRate = rows.length >= MINIMUM_SAMPLES_PER_BUCKET ? round(successes / rows.length) : null
    const gap = meanPredicted !== null && observedRate !== null ? round(observedRate - meanPredicted) : null
    return { lowerBound, upperBound, samples: rows.length, successes, meanPredicted, observedRate, gap, verdict: verdictFor(gap, rows.length, MINIMUM_SAMPLES_PER_BUCKET) }
  })
  if (clean.length < MINIMUM_SAMPLES_OVERALL) return {
    samples: clean.length, overallGap: null, buckets, falseConfidenceRate: null, missedAnswerRate: null,
    verdict: 'insufficient_evidence',
    summary: `${clean.length} outcome-linked answers; ${MINIMUM_SAMPLES_OVERALL} are needed before calibration can be judged. Until then the confidence threshold should not be moved on this evidence.`,
  }
  const claimed = clean.reduce((sum, row) => sum + row.predicted, 0) / clean.length
  const actual = clean.filter(row => row.observed).length / clean.length
  const overallGap = round(actual - claimed)
  const answered = clean.filter(row => row.predicted >= threshold)
  const escalated = clean.filter(row => row.predicted < threshold)
  const falseConfidenceRate = answered.length >= MINIMUM_SAMPLES_PER_BUCKET ? round(answered.filter(row => !row.observed).length / answered.length) : null
  const missedAnswerRate = escalated.length >= MINIMUM_SAMPLES_PER_BUCKET ? round(escalated.filter(row => row.observed).length / escalated.length) : null
  const verdict = verdictFor(overallGap, clean.length, MINIMUM_SAMPLES_OVERALL)
  const summary = verdict === 'overconfident'
    ? `COS is OVERCONFIDENT by ${Math.abs(Math.round(overallGap * 100))} points: it claims ${round(claimed, 2)} and delivers ${round(actual, 2)}. Answers that should have escalated never create a learning gap.`
    : verdict === 'underconfident'
      ? `COS is UNDERCONFIDENT by ${Math.round(overallGap * 100)} points: it claims ${round(claimed, 2)} and delivers ${round(actual, 2)}. It is escalating work it could have handled.`
      : `COS is well calibrated: claims ${round(claimed, 2)}, delivers ${round(actual, 2)}. If the study queue is starving, the threshold is the thing to revisit.`
  return { samples: clean.length, overallGap, buckets, falseConfidenceRate, missedAnswerRate, verdict, summary }
}

export function thresholdForEscalationRate(predictions: readonly number[], targetEscalationRate: number): number | null {
  const values = (Array.isArray(predictions) ? predictions : []).map(clamp01).sort((a, b) => a - b)
  if (values.length < MINIMUM_SAMPLES_OVERALL) return null
  const index = Math.floor(values.length * Math.max(0, Math.min(1, Number(targetEscalationRate) || 0)))
  return index <= 0 ? null : round(values[Math.min(index, values.length - 1)], 2)
}

function cohortKey(value: unknown): string {
  const normalized = String(value ?? '').trim()
  return normalized ? normalized.slice(0, 120) : 'unknown'
}

/**
 * Cohorts are observational reports only. They deliberately never change the live gate: each
 * recommendation must still win on an independent held-out cohort before human promotion.
 */
export function buildCalibrationCohorts(samples: readonly CalibrationCohortSample[], threshold = 0.72): CalibrationCohort[] {
  const dimensions = [
    ['problem_class', (sample: CalibrationCohortSample) => sample.problemClass] as const,
    ['reasoner', (sample: CalibrationCohortSample) => sample.reasonerLabel] as const,
    ['evidence_regime', (sample: CalibrationCohortSample) => sample.evidenceRegime] as const,
  ]
  return dimensions.flatMap(([dimension, valueFor]) => {
    const grouped = new Map<string, CalibrationSample[]>()
    for (const sample of samples) {
      const key = cohortKey(valueFor(sample))
      const rows = grouped.get(key) ?? []
      rows.push({ predicted: sample.predicted, observed: sample.observed })
      grouped.set(key, rows)
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, rows]) => {
      const report = calibrateAnswerConfidence(rows, threshold)
      const thresholdOption = report.verdict === 'overconfident'
        ? thresholdForEscalationRate(rows.map(row => row.predicted), 0.2)
        : null
      return {
        dimension,
        key,
        report,
        shadowRecommendation: thresholdOption === null
          ? { eligible: false, threshold: null, reason: report.samples < MINIMUM_SAMPLES_OVERALL ? 'Insufficient outcome-linked samples.' : 'No threshold change is indicated by this cohort.' }
          : { eligible: false, threshold: thresholdOption, reason: 'Shadow-only: validate on separate held-out outcomes before any human-approved promotion.' },
      }
    })
  })
}
