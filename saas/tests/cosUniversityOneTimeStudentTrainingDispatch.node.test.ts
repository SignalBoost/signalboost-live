import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ONE_TIME_STUDENT_TRAINING_MAX_ESTIMATED_COST_USD,
  ONE_TIME_STUDENT_TRAINING_MAX_HOURLY_COST_USD,
  ONE_TIME_STUDENT_TRAINING_REQUIRED_FLAVOR,
  oneTimeStudentTrainingApprovalEventKey,
} from '../lib/ai/cos/cosUniversityOneTimeStudentTrainingDispatch.ts'

test('one-time student training keeps the approved T4 and cost ceilings', () => {
  assert.equal(ONE_TIME_STUDENT_TRAINING_REQUIRED_FLAVOR, 't4-small')
  assert.equal(ONE_TIME_STUDENT_TRAINING_MAX_HOURLY_COST_USD, 0.41)
  assert.equal(ONE_TIME_STUDENT_TRAINING_MAX_ESTIMATED_COST_USD, 1.61)
})

test('one-time student training token is stored only as a deterministic hash', () => {
  const raw = 'student-training-approval-token-20260913-1234567890'
  const key = oneTimeStudentTrainingApprovalEventKey(raw)
  assert.match(key, /^[a-f0-9]{64}$/)
  assert.notEqual(key, raw)
  assert.equal(key, oneTimeStudentTrainingApprovalEventKey(raw))
})

test('one-time student training rejects undersized bearer tokens', () => {
  assert.throws(() => oneTimeStudentTrainingApprovalEventKey('too-short'), /one_time_student_training_approval_token_invalid/)
})
