import assert from 'node:assert/strict'
import test from 'node:test'
import { averageConfidence, calibrateConfidence } from '../lib/enterprise/memory/confidenceCalibration.ts'

test('averages bounded confidence fields', () => {
  assert.equal(averageConfidence({ industry: 0.8, audience: 0.6, invalid: 'x' }), 0.7)
  assert.equal(averageConfidence({ tooHigh: 9, negative: -1 }), 1)
  assert.equal(averageConfidence(null), 0)
})

test('calibrates overconfidence toward observed performance', () => {
  const result = calibrateConfidence(0.9, 0.2)
  assert.equal(result.direction, 'overconfident')
  assert.equal(result.calibrationError, 0.7)
  assert.equal(result.calibratedConfidence, 0.725)
})

test('calibrates underconfidence upward and remains bounded', () => {
  const result = calibrateConfidence(0.2, 2)
  assert.equal(result.direction, 'underconfident')
  assert.equal(result.observedPerformance, 1)
  assert.equal(result.calibratedConfidence, 0.4)
})

test('small differences are treated as aligned', () => {
  assert.equal(calibrateConfidence(0.7, 0.74).direction, 'aligned')
})

test('malformed inputs fail closed to zero', () => {
  assert.deepEqual(calibrateConfidence('bad', Number.NaN), {
    predictedConfidence: 0,
    observedPerformance: 0,
    calibrationError: 0,
    calibratedConfidence: 0,
    direction: 'aligned',
  })
})
