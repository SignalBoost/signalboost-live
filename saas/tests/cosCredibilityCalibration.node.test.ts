import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyIsotonicCalibration,
  brierScore,
  credibilityReport,
  expectedCalibrationError,
  fitIsotonicCalibration,
} from '../lib/ai/cos/credibility.ts'

test('perfectly calibrated correct and incorrect predictions have zero Brier score', () => {
  assert.equal(brierScore([
    { predictedConfidence: 1, correctness: 1 },
    { predictedConfidence: 0, correctness: 0 },
  ]), 0)
})

test('Brier score penalizes confident wrong answers', () => {
  assert.equal(brierScore([{ predictedConfidence: 0.9, correctness: 0 }]), 0.81)
})

test('ECE measures observed reliability rather than target confidence', () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({
    predictedConfidence: 0.8,
    correctness: index < 6 ? 1 : 0,
  }))
  assert.equal(expectedCalibrationError(rows), 0.2)
  const report = credibilityReport(rows)
  assert.equal(report.accuracy, 0.6)
  assert.equal(report.meanConfidence, 0.8)
  assert.equal(report.confidenceBias, 0.2)
})

test('credibility report measures abstention, provenance, action correctness and robustness separately', () => {
  const report = credibilityReport([
    { predictedConfidence: 0.9, correctness: 1, abstained: false, shouldAbstain: false, provenanceTruthful: true, actionCorrect: true, robustnessGroup: 'g', conclusionKey: 'a' },
    { predictedConfidence: 0.8, correctness: 1, abstained: false, shouldAbstain: false, provenanceTruthful: true, actionCorrect: false, robustnessGroup: 'g', conclusionKey: 'a' },
    { predictedConfidence: 0.2, correctness: 1, abstained: true, shouldAbstain: true, provenanceTruthful: false, robustnessGroup: 'g', conclusionKey: 'b' },
  ])
  assert.equal(report.abstention.coverage, 0.666667)
  assert.equal(report.abstention.appropriateAbstentionRate, 1)
  assert.equal(report.abstention.falseAbstentionRate, 0)
  assert.equal(report.provenance.truthfulRate, 0.666667)
  assert.equal(report.actions.correctnessRate, 0.5)
  assert.equal(report.robustness.consistencyRate, 0.666667)
})

test('isotonic calibration pools non-monotonic empirical correctness instead of inventing bonuses', () => {
  const fitted = fitIsotonicCalibration([
    { predictedConfidence: 0.6, correctness: 1 },
    { predictedConfidence: 0.7, correctness: 0 },
    { predictedConfidence: 0.8, correctness: 1 },
  ])
  assert.deepEqual(fitted, [
    { rawConfidence: 0.6, calibratedProbability: 0.5, samples: 1 },
    { rawConfidence: 0.7, calibratedProbability: 0.5, samples: 1 },
    { rawConfidence: 0.8, calibratedProbability: 1, samples: 1 },
  ])
  assert.equal(applyIsotonicCalibration(0.65, fitted), 0.5)
})

test('empty data never produces a fake calibrated probability', () => {
  assert.equal(applyIsotonicCalibration(0.78, []), null)
  assert.equal(credibilityReport([]).sampleSize, 0)
})
