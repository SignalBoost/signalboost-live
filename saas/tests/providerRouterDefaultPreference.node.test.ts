// tests/providerRouterDefaultPreference.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveProviderPreference } from '../lib/ai/providerRouter.ts'
import {
  builderCodingModelFromEnv,
  createBuilderCodingAiPort,
  DEFAULT_BUILDER_CODING_MODEL,
} from '../lib/cos/aiPort.ts'

test('default provider preference is local', () => {
  assert.equal(resolveProviderPreference(undefined, undefined), 'local')
  assert.equal(resolveProviderPreference(undefined, ''), 'local')
})
test('explicit preference is retained for downstream policy enforcement', () => {
  assert.equal(resolveProviderPreference('local', undefined), 'local')
  assert.equal(resolveProviderPreference('claude', undefined), 'claude')
})
test('hosted and unknown environment preferences fall back to local', () => {
  for (const value of ['openai', 'claude', 'gemini', 'not-a-real-provider']) assert.equal(resolveProviderPreference(undefined, value), 'local')
})

test('Builder coding port selects DeepSeek Flash without mutating the general COS model', async () => {
  const originalFetch = globalThis.fetch
  const originalEnv = {
    LOCAL_AI_BASE_URL: process.env.LOCAL_AI_BASE_URL,
    LOCAL_AI_ALLOWED_HOSTS: process.env.LOCAL_AI_ALLOWED_HOSTS,
    LOCAL_AI_API_KEY: process.env.LOCAL_AI_API_KEY,
    LOCAL_AI_MODEL: process.env.LOCAL_AI_MODEL,
    DEEPINFRA_BUILDER_MODEL: process.env.DEEPINFRA_BUILDER_MODEL,
  }
  let requestBody: Record<string, unknown> | null = null

  try {
    process.env.LOCAL_AI_BASE_URL = 'https://api.deepinfra.com/v1/openai'
    process.env.LOCAL_AI_ALLOWED_HOSTS = 'api.deepinfra.com'
    process.env.LOCAL_AI_API_KEY = 'test-deepinfra-key'
    process.env.LOCAL_AI_MODEL = 'Qwen/Qwen3.6-35B-A3B'
    delete process.env.DEEPINFRA_BUILDER_MODEL

    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'https://api.deepinfra.com/v1/openai/chat/completions')
      requestBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"type":"final","answer":"ok"}' } }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    assert.equal(builderCodingModelFromEnv(), DEFAULT_BUILDER_CODING_MODEL)
    const response = await createBuilderCodingAiPort().generate({ prompt: 'Repair this code and return the control object.' })
    assert.equal(response, '{"type":"final","answer":"ok"}')
    assert.equal(requestBody?.model, DEFAULT_BUILDER_CODING_MODEL)
    assert.equal(process.env.LOCAL_AI_MODEL, 'Qwen/Qwen3.6-35B-A3B')
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('Builder coding model can be overridden independently for controlled evaluation', () => {
  const original = process.env.DEEPINFRA_BUILDER_MODEL
  try {
    process.env.DEEPINFRA_BUILDER_MODEL = 'deepseek-ai/DeepSeek-V4-Pro-0813'
    assert.equal(builderCodingModelFromEnv(), 'deepseek-ai/DeepSeek-V4-Pro-0813')
  } finally {
    if (original === undefined) delete process.env.DEEPINFRA_BUILDER_MODEL
    else process.env.DEEPINFRA_BUILDER_MODEL = original
  }
})
