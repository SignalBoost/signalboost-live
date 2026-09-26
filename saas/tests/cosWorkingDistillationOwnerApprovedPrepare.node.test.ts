import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('../app/api/cron/cos-working-distillation-owner-approved-prepare/route.ts', import.meta.url),
  'utf8',
)

test('owner-approved Working COS preparation is exact, one-shot, and never authorizes training', () => {
  assert.match(source, /working-cos:d1be42c94d892b75bf272e3a34ad78e1/)
  assert.match(source, /fcbf51dae199418a11da0fb66a29b3098a7742e38e0b82a752c6a8a721b0eb52/)
  assert.match(source, /working_cos_owner_approval_expired/)
  assert.match(source, /event_type', 'provider_accepted'/)
  assert.match(source, /operation', 'prepare_dataset'/)
  assert.match(source, /dispatchWorkingCosDatasetPreparation/)
  assert.match(source, /confirmDispatch: true/)
  assert.match(source, /automaticTrainingAuthorized: false/)
  assert.match(source, /productionTrafficAuthorized: false/)
  assert.doesNotMatch(source, /dispatchWorkingCosTraining/)
})
