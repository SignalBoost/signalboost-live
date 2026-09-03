// tests/providerRouterDefaultPreference.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveProviderPreference } from '../lib/ai/providerRouter.ts'
import { ownerPlatformIdentityContext } from '../lib/ai/cos/platformIdentityContext.ts'
import {
  builderCodingModelFromEnv,
  createBuilderCodingAiPort,
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

test('Builder coding model fails closed when runtime configuration is missing', () => {
  const original = process.env.DEEPINFRA_BUILDER_MODEL
  try {
    delete process.env.DEEPINFRA_BUILDER_MODEL
    assert.throws(() => builderCodingModelFromEnv(), /DEEPINFRA_BUILDER_MODEL is required/)
  } finally {
    if (original === undefined) delete process.env.DEEPINFRA_BUILDER_MODEL
    else process.env.DEEPINFRA_BUILDER_MODEL = original
  }
})

test('Builder coding port sends the exact runtime-configured model without mutating general COS', async () => {
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
    const runtimeBuilderModel = 'provider/runtime-builder-model'
    process.env.LOCAL_AI_BASE_URL = 'https://api.deepinfra.com/v1/openai'
    process.env.LOCAL_AI_ALLOWED_HOSTS = 'api.deepinfra.com'
    process.env.LOCAL_AI_API_KEY = 'test-deepinfra-key'
    process.env.LOCAL_AI_MODEL = 'provider/runtime-general-model'
    process.env.DEEPINFRA_BUILDER_MODEL = runtimeBuilderModel

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

    assert.equal(builderCodingModelFromEnv(), runtimeBuilderModel)
    const response = await createBuilderCodingAiPort().generate({ prompt: 'Repair this code and return the control object.' })
    assert.equal(response, '{"type":"final","answer":"ok"}')
    assert.equal(requestBody?.model, runtimeBuilderModel)
    assert.equal(process.env.LOCAL_AI_MODEL, 'provider/runtime-general-model')
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('owner model topology never substitutes hard-coded identifiers for missing runtime facts', () => {
  const keys = ['LOCAL_AI_MODEL', 'DEEPINFRA_BUILDER_MODEL', 'LOCAL_AI_EMBEDDING_MODEL', 'LOCAL_AI_MANAGED_PROVIDER'] as const
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]])) as Record<(typeof keys)[number], string | undefined>
  try {
    for (const key of keys) delete process.env[key]
    const context = ownerPlatformIdentityContext()
    assert.match(context, /LOCAL_AI_MODEL is not configured in this runtime/)
    assert.match(context, /DEEPINFRA_BUILDER_MODEL is not configured in this runtime/)
    assert.match(context, /LOCAL_AI_EMBEDDING_MODEL is not configured in this runtime/)
    assert.match(context, /LOCAL_AI_MANAGED_PROVIDER is not configured in this runtime/)
    assert.equal(/Qwen\//.test(context), false)
    assert.equal(/DeepSeek/.test(context), false)
    assert.equal(/BAAI\//.test(context), false)
  } finally {
    for (const key of keys) {
      const value = original[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
