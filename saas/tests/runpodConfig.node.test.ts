import test from 'node:test'
import assert from 'node:assert/strict'
import {
  configuredRunpodPodId,
  deriveRunpodPodIdFromLocalAiBaseUrl,
  explicitRunpodPodId,
  runpodPrimaryBaseUrl,
  runpodPrimaryHost,
} from '../lib/ai/cos/runpodConfig.ts'

const previousPodId = process.env.RUNPOD_POD_ID
const previousPrimaryPodId = process.env.RUNPOD_PRIMARY_POD_ID
const previousBaseUrl = process.env.LOCAL_AI_BASE_URL

test.afterEach(() => {
  if (previousPodId === undefined) delete process.env.RUNPOD_POD_ID
  else process.env.RUNPOD_POD_ID = previousPodId
  if (previousPrimaryPodId === undefined) delete process.env.RUNPOD_PRIMARY_POD_ID
  else process.env.RUNPOD_PRIMARY_POD_ID = previousPrimaryPodId
  if (previousBaseUrl === undefined) delete process.env.LOCAL_AI_BASE_URL
  else process.env.LOCAL_AI_BASE_URL = previousBaseUrl
})

test('derives RunPod pod id from the standard proxy hostname', () => {
  assert.equal(
    deriveRunpodPodIdFromLocalAiBaseUrl('https://r4if78-11434.proxy.runpod.net/v1'),
    'r4if78',
  )
})

test('RUNPOD_PRIMARY_POD_ID controls RunPod even while LOCAL_AI points at DeepInfra fallback', () => {
  process.env.RUNPOD_PRIMARY_POD_ID = 'primary123'
  process.env.RUNPOD_POD_ID = 'legacy456'
  process.env.LOCAL_AI_BASE_URL = 'https://api.deepinfra.com/v1/openai'
  assert.equal(explicitRunpodPodId(), 'primary123')
  assert.equal(configuredRunpodPodId(), 'primary123')
  assert.equal(runpodPrimaryHost(), 'primary123-11434.proxy.runpod.net')
  assert.equal(runpodPrimaryBaseUrl(), 'https://primary123-11434.proxy.runpod.net/v1')
})

test('legacy RUNPOD_POD_ID remains compatible when the primary variable is absent', () => {
  delete process.env.RUNPOD_PRIMARY_POD_ID
  process.env.RUNPOD_POD_ID = 'legacy123'
  process.env.LOCAL_AI_BASE_URL = 'https://api.deepinfra.com/v1/openai'
  assert.equal(configuredRunpodPodId(), 'legacy123')
})

test('endpoint-derived id remains last-resort compatibility', () => {
  delete process.env.RUNPOD_PRIMARY_POD_ID
  delete process.env.RUNPOD_POD_ID
  process.env.LOCAL_AI_BASE_URL = 'https://derived456-11434.proxy.runpod.net/v1'
  assert.equal(configuredRunpodPodId(), 'derived456')
})

test('returns null for non-RunPod endpoints without an explicit id', () => {
  delete process.env.RUNPOD_PRIMARY_POD_ID
  delete process.env.RUNPOD_POD_ID
  process.env.LOCAL_AI_BASE_URL = 'https://api.deepinfra.com/v1/openai'
  assert.equal(configuredRunpodPodId(), null)
})
