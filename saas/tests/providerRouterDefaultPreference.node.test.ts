// saas/tests/providerRouterDefaultPreference.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveProviderPreference } from '../lib/ai/providerRouter.ts'
import {
  builderCodingModelFromEnv,
  createBuilderCodingAiPort,
} from '../lib/cos/aiPort.ts'
import {
  BUILDER_MODEL_NOT_CONFIGURED,
  ownerPlatformIdentityContext,
} from '../lib/ai/cos/platformIdentityContext.ts'

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
    const runtimeGeneralModel = 'provider/runtime-general-model'
    const runtimeBuilderModel = 'provider/runtime-builder-model'
    process.env.LOCAL_AI_BASE_URL = 'https://api.deepinfra.com/v1/openai'
    process.env.LOCAL_AI_ALLOWED_HOSTS = 'api.deepinfra.com'
    process.env.LOCAL_AI_API_KEY = 'test-deepinfra-key'
    process.env.LOCAL_AI_MODEL = runtimeGeneralModel
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
    assert.equal(process.env.LOCAL_AI_MODEL, runtimeGeneralModel)
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
    process.env.DEEPINFRA_BUILDER_MODEL = 'provider/evaluation-builder-model'
    assert.equal(builderCodingModelFromEnv(), 'provider/evaluation-builder-model')
  } finally {
    if (original === undefined) delete process.env.DEEPINFRA_BUILDER_MODEL
    else process.env.DEEPINFRA_BUILDER_MODEL = original
  }
})

// Owner rule: no hard-coded configuration. An unset Builder model is a configuration error the
// operator can act on, never a silent substitution that reaches the provider.
test('an unset Builder model fails closed instead of falling back to a default', () => {
  const original = process.env.DEEPINFRA_BUILDER_MODEL
  try {
    delete process.env.DEEPINFRA_BUILDER_MODEL
    assert.throws(() => builderCodingModelFromEnv(), new RegExp(BUILDER_MODEL_NOT_CONFIGURED))
    process.env.DEEPINFRA_BUILDER_MODEL = '   '
    assert.throws(() => builderCodingModelFromEnv(), new RegExp(BUILDER_MODEL_NOT_CONFIGURED))
  } finally {
    if (original === undefined) delete process.env.DEEPINFRA_BUILDER_MODEL
    else process.env.DEEPINFRA_BUILDER_MODEL = original
  }
})

test('owner topology reports missing runtime facts instead of substituting committed identifiers', () => {
  const keys = ['LOCAL_AI_MODEL', 'DEEPINFRA_BUILDER_MODEL', 'LOCAL_AI_EMBEDDING_MODEL', 'LOCAL_AI_MANAGED_PROVIDER'] as const
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]])) as Record<(typeof keys)[number], string | undefined>
  try {
    for (const key of keys) delete process.env[key]
    const context = ownerPlatformIdentityContext()
    for (const key of keys) assert.match(context, new RegExp(`NOT CONFIGURED: ${key}`))
    assert.doesNotMatch(context, /provider\/runtime-general-model/)
    assert.doesNotMatch(context, /provider\/runtime-builder-model/)
  } finally {
    for (const key of keys) {
      const value = original[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
