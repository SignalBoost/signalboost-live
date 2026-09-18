// saas/tests/cosUniversityLaneExpectation.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cosUniversityLaneExpectation,
  classifyCosUniversityLane,
  cosUniversityLaneStatusIsFault,
} from '../lib/ai/cos/cosUniversityLaneExpectation.ts'

/** Undergraduate residence is still running; no Master's or PhD enrollment exists. */
const RESIDENCE = { undergraduate: 'minimum_residence' } as const

test('the exact production incident: a receipt reporting the flag off is a fault, not an absence', () => {
  const expectation = cosUniversityLaneExpectation({ path: 'independent_exams', timingByLevel: RESIDENCE })
  assert.equal(expectation, 'expected_running')
  const status = classifyCosUniversityLane(expectation, {
    path: 'independent_exams', receiptFound: true, featureEnabled: false, verified: false,
    executionBlocker: 'execution_evidence_missing',
  })
  assert.equal(status, 'unexpectedly_disabled')
  assert.equal(cosUniversityLaneStatusIsFault(status), true)
})

test('graduation off during residence is correct and raises nothing', () => {
  const expectation = cosUniversityLaneExpectation({
    path: 'graduation', timingByLevel: RESIDENCE, terminalPrerequisiteMet: false,
  })
  assert.equal(expectation, 'expected_gated')
  const status = classifyCosUniversityLane(expectation, {
    path: 'graduation', receiptFound: false, featureEnabled: false, verified: false,
    executionBlocker: 'execution_evidence_missing',
  })
  assert.equal(status, 'gated_as_expected')
  assert.equal(cosUniversityLaneStatusIsFault(status), false)
})

test('graduation and exams were indistinguishable on the board; they are not here', () => {
  const exams = classifyCosUniversityLane(
    cosUniversityLaneExpectation({ path: 'independent_exams', timingByLevel: RESIDENCE }),
    { path: 'independent_exams', receiptFound: true, featureEnabled: false, verified: false },
  )
  const graduation = classifyCosUniversityLane(
    cosUniversityLaneExpectation({ path: 'graduation', timingByLevel: RESIDENCE }),
    { path: 'graduation', receiptFound: true, featureEnabled: false, verified: false },
  )
  assert.notEqual(exams, graduation)
})

test('an enabled lane that produced no receipt is dark, separately from being disabled', () => {
  const status = classifyCosUniversityLane('expected_running', {
    path: 'continuous_learning', receiptFound: true, featureEnabled: true, verified: false,
    executionBlocker: 'execution_evidence_missing',
  })
  assert.equal(status, 'unexpectedly_dark')
  assert.equal(cosUniversityLaneStatusIsFault(status), true)
})

test('a lane with no receipt on this build is dark, never accused of having its flag off', () => {
  // featureEnabled is read out of receipt evidence. With no receipt it is false by absence, and
  // the board has observed nothing whatsoever about the environment variable.
  for (const path of ['registered_agent_cycle', 'deliberate_practice', 'subject_a_range_evidence'] as const) {
    const status = classifyCosUniversityLane(
      cosUniversityLaneExpectation({ path, timingByLevel: RESIDENCE }),
      {
        path, receiptFound: false, featureEnabled: false, verified: false,
        executionBlocker: 'execution_evidence_missing',
      },
    )
    assert.equal(status, 'unexpectedly_dark')
    assert.equal(cosUniversityLaneStatusIsFault(status), true)
  }
})

test('the Sep 13 fresh deployment reported no lane as disabled', () => {
  // Every path on commit 8caa54cd carried receiptFound false and featureEnabled false. Under the
  // previous rule that produced seven unexpectedly_disabled faults, three of them for lanes
  // verified enabled two hours earlier. Dark is claimable from that board; disabled is not.
  const statuses = ([
    'registered_agent_cycle', 'continuous_learning', 'deliberate_practice', 'independent_exams',
    'subject_a_range_evidence', 'language_a_range_evidence', 'delayed_retention',
  ] as const).map(path => classifyCosUniversityLane(
    cosUniversityLaneExpectation({ path, timingByLevel: RESIDENCE }),
    {
      path, receiptFound: false, featureEnabled: false, verified: false,
      executionBlocker: 'execution_evidence_missing',
    },
  ))
  assert.equal(statuses.includes('unexpectedly_disabled'), false)
  assert.deepEqual([...new Set(statuses)], ['unexpectedly_dark'])
})

test('runner_not_invoked is patience, not a fault — the A-range lanes clear themselves', () => {
  for (const path of ['subject_a_range_evidence', 'language_a_range_evidence', 'delayed_retention'] as const) {
    const status = classifyCosUniversityLane(
      cosUniversityLaneExpectation({ path, timingByLevel: RESIDENCE }),
      {
        path, receiptFound: true, featureEnabled: true, verified: false,
        executionBlocker: 'runner_not_invoked',
      },
    )
    assert.equal(status, 'idle_no_eligible_work')
    assert.equal(cosUniversityLaneStatusIsFault(status), false)
  }
})

test('the verified lanes report as running', () => {
  for (const path of ['registered_agent_cycle', 'continuous_learning', 'deliberate_practice'] as const) {
    const status = classifyCosUniversityLane(
      cosUniversityLaneExpectation({ path, timingByLevel: RESIDENCE }),
      { path, receiptFound: true, featureEnabled: true, verified: true, executionBlocker: null },
    )
    assert.equal(status, 'running_as_expected')
  }
})

test('paths for a program nobody is enrolled in owe no receipt', () => {
  for (const path of ['masters_learning', 'masters_exams', 'phd_runtime', 'phd_progress'] as const) {
    const expectation = cosUniversityLaneExpectation({ path, timingByLevel: RESIDENCE })
    assert.equal(expectation, 'expected_absent')
    assert.equal(classifyCosUniversityLane(expectation, {
      path, receiptFound: false, featureEnabled: false, verified: false,
    }), 'absent_as_expected')
  }
})

test('PhD research running while nobody is enrolled in a PhD is staging drift, and is surfaced', () => {
  const expectation = cosUniversityLaneExpectation({ path: 'phd_research', timingByLevel: RESIDENCE })
  assert.equal(expectation, 'expected_absent')
  // Absent paths owe nothing, so an enabled one is not an incident — but with a PhD enrolled and
  // gated, an enabled terminal path is drift and must be visible.
  const gated = cosUniversityLaneExpectation({
    path: 'phd_admission',
    timingByLevel: { undergraduate: 'minimum_residence', phd: 'minimum_residence' },
    terminalPrerequisiteMet: false,
  })
  assert.equal(gated, 'expected_gated')
  const status = classifyCosUniversityLane(gated, {
    path: 'phd_admission', receiptFound: true, featureEnabled: true, verified: true,
  })
  assert.equal(status, 'unexpectedly_enabled')
  assert.equal(cosUniversityLaneStatusIsFault(status), true)
})

test('a gated lane with no receipt is never called drift', () => {
  const gated = cosUniversityLaneExpectation({
    path: 'phd_admission',
    timingByLevel: { undergraduate: 'minimum_residence', phd: 'minimum_residence' },
    terminalPrerequisiteMet: false,
  })
  const status = classifyCosUniversityLane(gated, {
    path: 'phd_admission', receiptFound: false, featureEnabled: true, verified: false,
  })
  assert.equal(status, 'gated_as_expected')
  assert.equal(cosUniversityLaneStatusIsFault(status), false)
})

test('graduation becomes expected once its prerequisite is met', () => {
  const expectation = cosUniversityLaneExpectation({
    path: 'graduation',
    timingByLevel: { undergraduate: 'on_schedule' },
    terminalPrerequisiteMet: true,
  })
  assert.equal(expectation, 'expected_running')
})

test('an expired program stops expecting anything', () => {
  const expectation = cosUniversityLaneExpectation({
    path: 'continuous_learning', timingByLevel: { undergraduate: 'deadline_expired' },
  })
  assert.equal(expectation, 'expected_absent')
})

test('fine tuning belongs to no calendar and is never reported dark', () => {
  const expectation = cosUniversityLaneExpectation({ path: 'controlled_fine_tuning', timingByLevel: RESIDENCE })
  assert.equal(expectation, 'expected_gated')
  assert.equal(classifyCosUniversityLane(expectation, {
    path: 'controlled_fine_tuning', receiptFound: true, featureEnabled: true, verified: false,
    executionBlocker: 'runner_not_invoked',
  }), 'gated_as_expected')
})


test('operational evaluation and supervision lanes are expected to run or idle, never reported as drift', () => {
  for (const path of [
    'distilled_independent_evaluation',
    'mass_distilled_independent_evaluation',
    'mass_distillation_supervision',
  ] as const) {
    const expectation = cosUniversityLaneExpectation({ path, timingByLevel: RESIDENCE })
    assert.equal(expectation, 'expected_running')
    assert.equal(classifyCosUniversityLane(expectation, {
      path, receiptFound: true, featureEnabled: true, verified: true, executionBlocker: null,
    }), 'running_as_expected')
    assert.equal(classifyCosUniversityLane(expectation, {
      path, receiptFound: true, featureEnabled: true, verified: false, executionBlocker: 'runner_not_invoked',
    }), 'idle_no_eligible_work')
  }
})

test('an undeclared path is never assumed healthy', () => {
  const expectation = cosUniversityLaneExpectation({
    path: 'some_future_lane' as never, timingByLevel: RESIDENCE,
  })
  assert.equal(expectation, 'undeclared')
  const status = classifyCosUniversityLane(expectation, {
    path: 'some_future_lane' as never, receiptFound: true, featureEnabled: true, verified: true,
  })
  assert.equal(status, 'undeclared')
  assert.equal(cosUniversityLaneStatusIsFault(status), true)
})

test('the whole Sep 13 board yields exactly one fault', () => {
  const board = [
    { path: 'registered_agent_cycle', receiptFound: true, featureEnabled: true, verified: true, executionBlocker: null },
    { path: 'continuous_learning', receiptFound: true, featureEnabled: true, verified: true, executionBlocker: null },
    { path: 'deliberate_practice', receiptFound: true, featureEnabled: true, verified: true, executionBlocker: null },
    { path: 'independent_exams', receiptFound: true, featureEnabled: false, verified: false, executionBlocker: 'execution_evidence_missing' },
    { path: 'subject_a_range_evidence', receiptFound: true, featureEnabled: true, verified: false, executionBlocker: 'runner_not_invoked' },
    { path: 'language_a_range_evidence', receiptFound: true, featureEnabled: true, verified: false, executionBlocker: 'runner_not_invoked' },
    { path: 'delayed_retention', receiptFound: true, featureEnabled: true, verified: false, executionBlocker: 'runner_not_invoked' },
    { path: 'graduation', receiptFound: false, featureEnabled: false, verified: false, executionBlocker: 'execution_evidence_missing' },
    { path: 'masters_learning', receiptFound: false, featureEnabled: false, verified: false, executionBlocker: 'execution_evidence_missing' },
    { path: 'masters_admission', receiptFound: false, featureEnabled: false, verified: false, executionBlocker: 'execution_evidence_missing' },
    { path: 'masters_exams', receiptFound: false, featureEnabled: false, verified: false, executionBlocker: 'execution_evidence_missing' },
    { path: 'masters_progress', receiptFound: false, featureEnabled: false, verified: false, executionBlocker: 'execution_evidence_missing' },
    { path: 'phd_runtime', receiptFound: false, featureEnabled: false, verified: false, executionBlocker: 'execution_evidence_missing' },
    { path: 'phd_admission', receiptFound: false, featureEnabled: false, verified: false, executionBlocker: 'execution_evidence_missing' },
    { path: 'phd_progress', receiptFound: false, featureEnabled: false, verified: false, executionBlocker: 'execution_evidence_missing' },
    { path: 'phd_research', receiptFound: true, featureEnabled: true, verified: true, executionBlocker: null },
    { path: 'phd_methodology_exams', receiptFound: true, featureEnabled: true, verified: true, executionBlocker: null },
    { path: 'controlled_fine_tuning', receiptFound: true, featureEnabled: true, verified: false, executionBlocker: 'runner_not_invoked' },
  ] as const

  const faults = board
    .map(row => ({
      path: row.path,
      status: classifyCosUniversityLane(
        cosUniversityLaneExpectation({ path: row.path as never, timingByLevel: RESIDENCE }),
        row as never,
      ),
    }))
    .filter(row => cosUniversityLaneStatusIsFault(row.status))

  // Thirteen paths were unverified. Exactly one of them was an incident.
  assert.deepEqual(faults, [{ path: 'independent_exams', status: 'unexpectedly_disabled' }])
})
