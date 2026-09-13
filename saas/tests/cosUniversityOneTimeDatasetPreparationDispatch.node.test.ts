import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ONE_TIME_DATASET_PREPARATION_MAX_ESTIMATED_COST_USD,
  ONE_TIME_DATASET_PREPARATION_MAX_HOURLY_COST_USD,
  oneTimeDatasetPreparationApprovalEventKey,
} from '../lib/ai/cos/cosUniversityOneTimeDatasetPreparationDispatch.ts'

test('one-time dataset preparation keeps the approved hard cost ceilings', () => {
  assert.equal(ONE_TIME_DATASET_PREPARATION_MAX_HOURLY_COST_USD, 0.05)
  assert.equal(ONE_TIME_DATASET_PREPARATION_MAX_ESTIMATED_COST_USD, 0.015)
})

test('one-time dataset preparation token becomes a non-secret deterministic hash', () => {
  const raw = 'dataset-preparation-approval-token-20260913-1234567890'
  const key = oneTimeDatasetPreparationApprovalEventKey(raw)
  assert.match(key, /^[a-f0-9]{64}$/)
  assert.notEqual(key, raw)
  assert.equal(key, oneTimeDatasetPreparationApprovalEventKey(raw))
})

test('one-time dataset preparation rejects undersized bearer tokens', () => {
  assert.throws(
    () => oneTimeDatasetPreparationApprovalEventKey('too-short'),
    /one_time_dataset_preparation_approval_token_invalid/,
  )
})
