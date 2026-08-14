import assert from 'node:assert/strict'
import test from 'node:test'
import { callProviderModelDetailed, withProviderExecutionTrace } from '../lib/ai/providerRouter'

test('external fallback reaches Gemini and preserves the actual provider/model', async () => {
  const originalFetch = globalThis.fetch
  const before = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    GEMINI_FALLBACK_MODEL: process.env.GEMINI_FALLBACK_MODEL,
  }
  process.env.OPENAI_API_KEY = 'openai-test'
  process.env.GEMINI_API_KEY = 'gemini-test'
  process.env.GEMINI_FALLBACK_MODEL = 'gemini-test-model'
  delete process.env.ANTHROPIC_API_KEY
  const seen: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    seen.push(url)
    if (url.includes('api.openai.com')) return new Response('{"error":{"code":"insufficient_quota"}}', { status: 429, headers: { 'content-type': 'application/json' } })
    if (url.includes('generativelanguage.googleapis.com')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'gemini teacher answer' }] } }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    throw new Error(`Unexpected fetch ${url}`)
  }) as typeof fetch

  try {
    const traced = await withProviderExecutionTrace(() => callProviderModelDetailed({ modelPreference: 'openai', prompt: 'diagnose this' }))
    assert.equal(traced.result?.text, 'gemini teacher answer')
    assert.equal(traced.result?.provider, 'gemini')
    assert.equal(traced.result?.model, 'gemini-test-model')
    assert.equal(traced.result?.requestedProvider, 'openai')
    assert.equal(traced.result?.fallbackUsed, true)
    assert.deepEqual(traced.trace, { provider: 'gemini', model: 'gemini-test-model', invoked: true, source: 'provider' })
    assert.equal(seen.some(url => url.includes('api.openai.com')), true)
    assert.equal(seen.some(url => url.includes('generativelanguage.googleapis.com')), true)
    assert.equal(seen.some(url => url.includes('api.anthropic.com')), false)
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
