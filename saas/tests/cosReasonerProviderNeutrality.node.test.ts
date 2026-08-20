import test from 'node:test'
import assert from 'node:assert/strict'
import {
  configuredRunpodPodId,
  deriveRunpodPodIdFromLocalAiBaseUrl,
  localInferenceTargetsRunpod,
  runpodControlConfigured,
} from '../lib/ai/cos/runpodConfig.ts'

const KEYS = ['LOCAL_AI_BASE_URL', 'RUNPOD_POD_ID', 'RUNPOD_API_KEY'] as const

function withEnv(values: Partial<Record<(typeof KEYS)[number], string | undefined>>, run: () => void): void {
  const previous = new Map<string, string | undefined>()
  for (const key of KEYS) {
    previous.set(key, process.env[key])
    const value = values[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    run()
  } finally {
    for (const key of KEYS) {
      const value = previous.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('RunPod proxy remains a first-class reasoner backend', () => {
  withEnv({
    LOCAL_AI_BASE_URL: 'https://yvj6e9zboi7ofo-11434.proxy.runpod.net/v1',
    RUNPOD_POD_ID: 'yvj6e9zboi7ofo',
    RUNPOD_API_KEY: 'test-key',
  }, () => {
    assert.equal(deriveRunpodPodIdFromLocalAiBaseUrl(), 'yvj6e9zboi7ofo')
    assert.equal(localInferenceTargetsRunpod(), true)
    assert.equal(configuredRunpodPodId(), 'yvj6e9zboi7ofo')
    assert.equal(runpodControlConfigured(), true)
  })
})

test('a managed OpenAI-compatible endpoint detaches stale RunPod lifecycle state', () => {
  withEnv({
    LOCAL_AI_BASE_URL: 'https://api.deepinfra.com/v1/openai',
    RUNPOD_POD_ID: 'yvj6e9zboi7ofo',
    RUNPOD_API_KEY: 'still-present-but-dormant',
  }, () => {
    assert.equal(deriveRunpodPodIdFromLocalAiBaseUrl(), null)
    assert.equal(localInferenceTargetsRunpod(), false)
    assert.equal(configuredRunpodPodId(), null)
    assert.equal(runpodControlConfigured(), false)
  })
})

test('another provider cannot accidentally wake the old RunPod just because credentials remain set', () => {
  withEnv({
    LOCAL_AI_BASE_URL: 'https://api.fireworks.ai/inference/v1',
    RUNPOD_POD_ID: 'old-pod',
    RUNPOD_API_KEY: 'old-key',
  }, () => {
    assert.equal(localInferenceTargetsRunpod(), false)
    assert.equal(runpodControlConfigured(), false)
  })
})

test('explicit RunPod id remains available for maintenance when no reasoner endpoint is configured', () => {
  withEnv({
    LOCAL_AI_BASE_URL: undefined,
    RUNPOD_POD_ID: 'maintenance-pod',
    RUNPOD_API_KEY: 'maintenance-key',
  }, () => {
    assert.equal(configuredRunpodPodId(), 'maintenance-pod')
    assert.equal(runpodControlConfigured(), true)
  })
})

test('a RunPod proxy URL remains authoritative over a stale explicit pod id', () => {
  withEnv({
    LOCAL_AI_BASE_URL: 'https://currentpod-11434.proxy.runpod.net/v1',
    RUNPOD_POD_ID: 'oldpod',
    RUNPOD_API_KEY: 'test-key',
  }, () => {
    assert.equal(configuredRunpodPodId(), 'currentpod')
    assert.equal(runpodControlConfigured(), true)
  })
})
