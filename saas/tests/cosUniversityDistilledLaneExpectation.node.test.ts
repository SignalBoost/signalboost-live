import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cosUniversityLaneExpectation,
  classifyCosUniversityLane,
  cosUniversityLaneStatusIsFault,
} from '../lib/ai/cos/cosUniversityLaneExpectation.ts'

const RESIDENCE = { undergraduate: 'minimum_residence' } as const

test('distilled independent evaluation is calendar-neutral while waiting on exact canary proof', () => {
  const expectation = cosUniversityLaneExpectation({
    path: 'distilled_independent_evaluation',
    timingByLevel: RESIDENCE,
  })
  assert.equal(expectation, 'expected_gated')
  const status = classifyCosUniversityLane(expectation, {
    path: 'distilled_independent_evaluation',
    receiptFound: true,
    featureEnabled: true,
    verified: false,
    executionBlocker: 'runner_not_invoked',
  })
  assert.equal(status, 'gated_as_expected')
  assert.equal(cosUniversityLaneStatusIsFault(status), false)
})

test('distilled independent evaluation cannot be reported undeclared', () => {
  assert.notEqual(cosUniversityLaneExpectation({
    path: 'distilled_independent_evaluation',
    timingByLevel: RESIDENCE,
  }), 'undeclared')
})
