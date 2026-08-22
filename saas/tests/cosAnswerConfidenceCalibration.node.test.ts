import assert from 'node:assert/strict'
import test from 'node:test'
import { MINIMUM_SAMPLES_OVERALL, MINIMUM_SAMPLES_PER_BUCKET, buildCalibrationCohorts, calibrateAnswerConfidence, thresholdForEscalationRate } from '../lib/ai/cos/answerConfidenceCalibration.ts'
const samples = (predicted: number, observed: boolean, count: number) => Array.from({ length: count }, () => ({ predicted, observed }))
test('withholds judgement below the sample minimum', () => {
  const report = calibrateAnswerConfidence(samples(0.75, true, MINIMUM_SAMPLES_OVERALL - 1))
  assert.equal(report.verdict, 'insufficient_evidence'); assert.equal(report.overallGap, null)
})
test('identifies high-confidence poor outcomes as overconfidence', () => {
  const report = calibrateAnswerConfidence([...samples(0.75, true, 16), ...samples(0.75, false, 24)])
  assert.equal(report.verdict, 'overconfident'); assert.ok(report.overallGap! < 0); assert.match(report.summary, /learning gap/)
})
test('identifies needless escalation as underconfidence', () => {
  assert.equal(calibrateAnswerConfidence([...samples(0.4, true, 35), ...samples(0.4, false, 5)]).verdict, 'underconfident')
})
test('withholds thin bucket rates and threshold suggestions', () => {
  const report = calibrateAnswerConfidence([...samples(0.95, true, MINIMUM_SAMPLES_PER_BUCKET - 1), ...samples(0.5, true, MINIMUM_SAMPLES_OVERALL)])
  assert.equal(report.buckets.find(bucket => bucket.lowerBound === 0.9)?.observedRate, null)
  assert.equal(thresholdForEscalationRate([0.7, 0.8], 0.1), null)
})
test('cohort recommendations remain shadow-only even when a cohort is overconfident', () => {
  const cohorts = buildCalibrationCohorts([...samples(0.9, false, 30)].map(row => ({ ...row, problemClass: 'security', reasonerLabel: 'local', evidenceRegime: 'grounded' })))
  const security = cohorts.find(cohort => cohort.dimension === 'problem_class' && cohort.key === 'security')
  assert.equal(security?.report.verdict, 'overconfident')
  assert.equal(security?.shadowRecommendation.eligible, false)
  assert.match(security?.shadowRecommendation.reason ?? '', /held-out/)
})
