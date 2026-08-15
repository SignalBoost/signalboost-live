import test from 'node:test'
import assert from 'node:assert/strict'
import {
  configuredRunpodPodId,
  deriveRunpodPodIdFromLocalAiBaseUrl,
  explicitRunpodPodId,
} from '../lib/ai/cos/runpodConfig.ts'

const previousPodId = process.env.RUNPOD_POD_ID
const previousBaseUrl = process.env.LOCAL_AI_BASE_URL

test.afterEach(() => {
  if (previousPodId === undefined) delete process.env.RUNPOD_POD_ID
  else process.env.RUNPOD_POD_ID = previousPodId
  if (previousBaseUrl === undefined) delete process.env.LOCAL_AI_BASE_URL
  else process.env.LOCAL_AI_BASE_URL = previousBaseUrl
})

test('derives RunPod pod id from the standard proxy hostname', () => {
  assert.equal(
    deriveRunpodPodIdFromLocalAiBaseUrl('https://r4if78-11434.proxy.runpod.net/v1'),
    'r4if78',
  )
})

test('explicit RUNPOD_POD_ID overrides the endpoint-derived id', () => {
  process.env.RUNPOD_POD_ID = 'explicit123'
  process.env.LOCAL_AI_BASE_URL = 'https://derived456-11434.proxy.runpod.net/v1'
  assert.equal(explicitRunpodPodId(), 'explicit123')
  assert.equal(configuredRunpodPodId(), 'explicit123')
})

test('returns null for non-RunPod endpoints without an explicit id', () => {
  delete process.env.RUNPOD_POD_ID
  process.env.LOCAL_AI_BASE_URL = 'https://ai.example.com/v1'
  assert.equal(configuredRunpodPodId(), null)
})
