import test from 'node:test'
import assert from 'node:assert/strict'
import { builderCapacityRetryDelayMs } from '../app/api/cron/builder-continuations/route.ts'

test('retries deferred Builder capacity with bounded exponential delays', () => {
  assert.equal(builderCapacityRetryDelayMs(1), 30_000)
  assert.equal(builderCapacityRetryDelayMs(2), 60_000)
  assert.equal(builderCapacityRetryDelayMs(3), 120_000)
  assert.equal(builderCapacityRetryDelayMs(8), 900_000)
  assert.equal(builderCapacityRetryDelayMs(99), 900_000)
})
