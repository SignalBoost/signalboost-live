import assert from 'node:assert/strict'
import test from 'node:test'
import { worldAwarenessCadencePolicy } from '../lib/ai/cos/worldAwarenessCadence.ts'

test('SignalBoost defaults to twice-daily awareness refresh', () => {
  const policy=worldAwarenessCadencePolicy({} as NodeJS.ProcessEnv)
  assert.equal(policy.cadence,'twice_daily')
  assert.equal(policy.intervalMinutes,720)
  assert.equal(policy.source,'preset')
})

test('enterprise deployments can choose hourly or near-real-time without code changes', () => {
  assert.deepEqual(
    worldAwarenessCadencePolicy({COS_WORLD_AWARENESS_CADENCE:'hourly'} as NodeJS.ProcessEnv),
    {cadence:'hourly',intervalMinutes:60,source:'preset'},
  )
  assert.deepEqual(
    worldAwarenessCadencePolicy({COS_WORLD_AWARENESS_CADENCE:'near_realtime'} as NodeJS.ProcessEnv),
    {cadence:'near_realtime',intervalMinutes:15,source:'preset'},
  )
})

test('custom cadence is bounded so accidental config cannot create an unbounded fetch loop', () => {
  assert.deepEqual(
    worldAwarenessCadencePolicy({COS_WORLD_AWARENESS_INTERVAL_MINUTES:'5'} as NodeJS.ProcessEnv),
    {cadence:'custom',intervalMinutes:15,source:'custom_interval'},
  )
  assert.deepEqual(
    worldAwarenessCadencePolicy({COS_WORLD_AWARENESS_INTERVAL_MINUTES:'180'} as NodeJS.ProcessEnv),
    {cadence:'custom',intervalMinutes:180,source:'custom_interval'},
  )
})
