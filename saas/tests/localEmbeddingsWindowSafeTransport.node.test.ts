// saas/tests/localEmbeddingsWindowSafeTransport.node.test.ts
//
// Execute the dependency-free retry functions with a fake provider, and check transport
// wiring separately. This avoids the module's Next.js path aliases in the bare Node runner.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const SOURCE = readFileSync('lib/ai/cos/localEmbeddings.ts', 'utf8')

// Execute the actual retry implementation with a fake transport; no Next.js aliases or
// provider credentials are needed. Keep source checks below for transport wiring.
const retrySource = SOURCE.slice(SOURCE.indexOf('function embeddingContextWindowError'), SOURCE.indexOf('function missingModelError'))
const windowSafe = new Function('Buffer', 'console', stripTypeScriptTypes(
  `const MAX_EMBEDDING_WINDOW_RETRIES = 5; ${retrySource}`,
) + '; return requestEmbeddingsWindowSafe;')(Buffer, { info() {} })
const overflow = { ok: false, status: 400, body: JSON.stringify({ error: { message:
  'You passed 513 input tokens and requested 0 output tokens. However, the model\'s context length is only 512 tokens, resulting in a maximum input length of 512 tokens.',
} }) }

test('recovers from capped 513-token reports for dense and multilingual inputs', async () => {
  for (const text of ['x '.repeat(500), '漢字🙂 '.repeat(1000), 'é'.repeat(1000)]) {
    const inputs: string[] = []
    const result = await windowSafe([text], {}, 'configured-model', async ([input]: string[]) => {
      inputs.push(input)
      assert.equal(input.isWellFormed(), true)
      return Buffer.byteLength(input, 'utf8') + 2 > 512
        ? overflow : { ok: true, vectors: [[1, 2, 3]] }
    })
    assert.equal(result.ok, true)
    assert.equal(inputs.length, 2, 'one bounded retry must fit even when the reported count is capped')
    assert.ok(inputs[1].includes('…'))
  }
})

test('batch overflow preserves order and leaves fitting inputs intact', async () => {
  const texts = ['short', 'x '.repeat(500), 'tail']
  const result = await windowSafe(texts, {}, 'configured-model', async (inputs: string[]) => {
    if (inputs.some(input => Buffer.byteLength(input) + 2 > 512)) return overflow
    return { ok: true, vectors: inputs.map(input => [input === 'short' ? 1 : input === 'tail' ? 3 : 2]) }
  })
  assert.deepEqual(result, { ok: true, vectors: [[1], [2], [3]] })
  assert.equal(texts[1].length, 1000, 'retained source content must not be modified')
})

test('unrelated provider errors are returned without retries', async () => {
  for (const status of [400, 401, 429, 500]) {
    let calls = 0
    const failure = { ok: false, status, body: 'provider failure' }
    assert.equal(await windowSafe(['text'], {}, 'configured-model', async () => { calls++; return failure }), failure)
    assert.equal(calls, 1)
  }
})

test('persistent overflow still stops at the bounded retry limit', async () => {
  let calls = 0
  const result = await windowSafe(['x'.repeat(10000)], {}, 'configured-model', async () => { calls++; return overflow })
  assert.equal(result.ok, false)
  assert.ok(calls <= 6)
})

test('the native transport is wrapped in the context-window retry', () => {
  // Production log, 2026-08-26: "You passed 513 input tokens ... context length is only 512".
  // nomic-embed-text has a 512-token window and any substantial question exceeds it, so an
  // unprotected transport fails hard and silently disables semantic cache for long prompts.
  assert.match(
    SOURCE,
    /requestEmbeddingsWindowSafe\(texts, config, model, requestNativeEmbeddings\)/,
    'the native fallback must go through the window-safe wrapper',
  )
})

test('the native transport is never called bare from the dispatcher', () => {
  const dispatcherAt = SOURCE.indexOf('async function requestCompatibleEmbeddings')
  assert.ok(dispatcherAt > 0)
  const dispatcher = SOURCE.slice(dispatcherAt, SOURCE.indexOf('\n}', dispatcherAt))
  assert.ok(
    !/await requestNativeEmbeddings\(/.test(dispatcher),
    'the dispatcher must not call the native transport without window protection',
  )
})

test('the retry wrapper accepts a transport rather than hard-coding one', () => {
  assert.match(SOURCE, /type EmbeddingRequester =/)
  assert.match(SOURCE, /request: EmbeddingRequester = requestEmbeddings/)
})

test('the batch retry path forwards the transport to each single retry', () => {
  // A batch response does not say which item overflowed, so each is retried individually. If the
  // transport were not forwarded, a native batch would silently retry on the OpenAI endpoint.
  assert.match(
    SOURCE,
    /requestSingleEmbeddingWindowSafe\(text, config, model, undefined, request\)/,
  )
})

test('the context-window detector still matches the provider error shape', () => {
  // Both clauses are required: the body must mention input tokens AND a limit.
  assert.match(SOURCE, /body\.includes\('input tokens'\)/)
  assert.match(SOURCE, /body\.includes\('context length'\)/)
  assert.match(SOURCE, /body\.includes\('maximum input length'\)/)
})

test('shrinking leaves a token margin so 512/513 cannot loop', () => {
  assert.match(SOURCE, /limit - 8/)
  assert.match(SOURCE, /MAX_EMBEDDING_WINDOW_RETRIES/)
})
