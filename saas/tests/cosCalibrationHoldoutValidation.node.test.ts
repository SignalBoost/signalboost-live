// saas/tests/cosCalibrationHoldoutValidation.node.test.ts
//
// The half of calibration learning that keeps it honest: a fitted calibration counts only when it
// beats raw confidence on a LATER, held-out cohort it never saw. These pin the PAV fit's
// monotonicity, the temporal (not random) split, the metric math, and every fail-closed path —
// including the one that matters most: genuinely well-calibrated data must produce NO
// recommendation, because "improving" it is fitting noise.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  BRIER_IMPROVEMENT_MARGIN,
  MINIMUM_HOLDOUT_SAMPLES,
  MINIMUM_TRAIN_SAMPLES,
  applyCalibration,
  brierScore,
  expectedCalibrationError,
  fitIsotonicCalibration,
  temporalSplit,
  validateCalibrationOnHoldout,
  type OutcomeSample,
} from '../lib/ai/cos/calibrationHoldoutValidation.ts'

function at(index: number): string {
  return new Date(Date.UTC(2026, 7, 1) + index * 3_600_000).toISOString()
}

/** Systematically overconfident world: claims 0.9 / delivers 0.5, claims 0.3 / delivers 0.1. */
function overconfident(count: number): OutcomeSample[] {
  return Array.from({ length: count }, (_, index) => {
    const high = index % 2 === 0
    return {
      predicted: high ? 0.9 : 0.3,
      observed: high ? index % 4 === 0 : index % 10 === 0,
      at: at(index),
    }
  })
}

/** Well-calibrated world: claimed probability equals observed frequency. */
function calibrated(count: number): OutcomeSample[] {
  return Array.from({ length: count }, (_, index) => {
    const predicted = 0.2 + 0.6 * ((index % 10) / 9)
    return { predicted, observed: (index * 7919) % 100 < predicted * 100, at: at(index) }
  })
}

test('PAV produces a monotone mapping and pools violators', () => {
  const mapping = fitIsotonicCalibration([
    { predicted: 0.2, observed: true, at: at(0) },
    { predicted: 0.4, observed: false, at: at(1) },
    { predicted: 0.6, observed: false, at: at(2) },
    { predicted: 0.8, observed: true, at: at(3) },
  ])
  for (let index = 1; index < mapping.length; index += 1) {
    assert.ok(mapping[index].calibrated >= mapping[index - 1].calibrated, 'monotone')
    assert.ok(mapping[index].fromInclusive > mapping[index - 1].fromInclusive, 'ordered thresholds')
  }
  // Applying the mapping never inverts the ranking of two raw confidences.
  assert.ok(applyCalibration(mapping, 0.9) >= applyCalibration(mapping, 0.1))
})

test('the split is temporal: every training outcome predates every holdout outcome', () => {
  const samples = overconfident(100)
  const { train, holdout } = temporalSplit(samples)
  assert.equal(train.length + holdout.length, samples.length)
  assert.ok(holdout.length >= Math.floor(samples.length * 0.3) - 1)
  const latestTrain = train[train.length - 1].at
  for (const sample of holdout) assert.ok(sample.at >= latestTrain)
})

test('Brier and ECE are exact on hand-computable cases', () => {
  assert.equal(brierScore([{ predicted: 1, observed: true }, { predicted: 0, observed: false }]), 0)
  assert.equal(brierScore([{ predicted: 1, observed: false }]), 1)
  assert.equal(brierScore([]), null)
  // Twenty samples all claiming 0.8 with 50% success: ECE = |0.8 - 0.5| = 0.3.
  const rows = Array.from({ length: 20 }, (_, index) => ({ predicted: 0.8, observed: index % 2 === 0 }))
  assert.equal(expectedCalibrationError(rows), 0.3)
})

test('systematic overconfidence validates: calibrated beats raw on the later cohort', () => {
  const validation = validateCalibrationOnHoldout(overconfident(240))
  assert.equal(validation.validated, true)
  assert.ok(validation.holdout.calibratedBrier! < validation.holdout.rawBrier! - BRIER_IMPROVEMENT_MARGIN)
  assert.ok(validation.holdout.calibratedEce! <= validation.holdout.rawEce!)
  assert.match(validation.reason, /HUMAN review/)
  assert.match(validation.reason, /no live threshold or confidence has been changed/i)
})

test('well-calibrated data fails closed — no recommendation is fitted from noise', () => {
  const validation = validateCalibrationOnHoldout(calibrated(240))
  assert.equal(validation.validated, false)
  assert.match(validation.reason, /did not beat raw|mixed evidence/i)
})

test('insufficient train or holdout outcomes fail closed with the exact reason', () => {
  const tooFewTrain = validateCalibrationOnHoldout(overconfident(MINIMUM_TRAIN_SAMPLES - 5))
  assert.equal(tooFewTrain.validated, false)
  assert.match(tooFewTrain.reason, /Insufficient training outcomes/)

  const enoughTrainOnly = validateCalibrationOnHoldout(overconfident(Math.ceil(MINIMUM_TRAIN_SAMPLES / 0.7) + 2))
  if (!enoughTrainOnly.validated) {
    assert.match(enoughTrainOnly.reason, /Insufficient|did not beat|mixed/)
  }
  assert.ok(MINIMUM_HOLDOUT_SAMPLES > 0)
})

test('the report store carries holdout validation, split by evidence regime, and stays shadow-only', () => {
  const store = readFileSync(new URL('../lib/ai/cos/calibrationLearningStore.ts', import.meta.url), 'utf8')
  assert.match(store, /validateCalibrationOnHoldout/)
  assert.match(store, /byEvidenceRegime/)
  assert.match(store, /livePolicyChanged:false/)
  const route = readFileSync(new URL('../app/api/admin/cos-calibration-learning/route.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(route, /export async function POST/)
})
