import assert from 'node:assert/strict'
import test from 'node:test'
import {
  distinctVerifiedCaseCount,
  nextDiverseCase,
  trackProblemClasses,
  verifiedOutcomeCountForCandidate,
} from '../lib/ai/cos/reasoningComparisonProgress.ts'

const cases = [
  { id: 'a', track: 'incident-reasoning', problemClass: 'incident diagnosis', origin: 'private' },
  { id: 'b', track: 'incident-reasoning', problemClass: 'incident diagnosis', origin: 'private' },
  { id: 'c', track: 'provenance', problemClass: 'cos self description', origin: 'private' },
]

const results = [
  { case_id: 'a', worker_role: 'primary', reasoner_label: 'qwen', verified_outcome_recorded: true, problem_class: 'incident diagnosis' },
  { case_id: 'a', worker_role: 'critic', reasoner_label: 'qwen', verified_outcome_recorded: true, problem_class: 'incident diagnosis' },
  { case_id: 'a', worker_role: 'primary', reasoner_label: 'qwen', verified_outcome_recorded: true, problem_class: 'incident diagnosis' },
  { case_id: 'b', worker_role: 'critic', reasoner_label: 'other-model', verified_outcome_recorded: true, problem_class: 'incident diagnosis' },
]

test('Phase 4 outcome count and diverse case count are intentionally different', () => {
  assert.equal(verifiedOutcomeCountForCandidate(results, {
    workerRole: 'primary', reasonerLabel: 'qwen', problemClass: 'incident diagnosis',
  }), 2)
  assert.equal(distinctVerifiedCaseCount(results, {
    workerRole: 'primary', reasonerLabel: 'qwen', caseIds: ['a', 'b'],
  }), 1)
})

test('next diverse case skips a case only after both selected workers are verified on the current reasoner', () => {
  assert.equal(nextDiverseCase(cases, results, {
    track: 'incident-reasoning', roles: ['primary', 'critic'], reasonerLabel: 'qwen', origin: 'private',
  })?.id, 'b')
})

test('model migration resets diverse evidence for the new reasoner label', () => {
  assert.equal(nextDiverseCase(cases, results, {
    track: 'incident-reasoning', roles: ['primary', 'critic'], reasonerLabel: 'new-qwen', origin: 'private',
  })?.id, 'a')
})

test('track learner buckets remain explicit', () => {
  assert.deepEqual(trackProblemClasses(cases, { track: 'incident-reasoning', origin: 'private' }), ['incident diagnosis'])
})
