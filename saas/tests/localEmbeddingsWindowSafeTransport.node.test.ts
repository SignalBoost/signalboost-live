// saas/tests/localEmbeddingsWindowSafeTransport.node.test.ts
//
// Source-level assertions, deliberately. localEmbeddings.ts imports through the '@/' path alias,
// which the bare node test runner cannot resolve — tests/localEmbeddings.node.test.ts and
// tests/localEmbeddingsNativeFallback.node.test.ts both fail to load for that reason and have
// been unable to run at all. This file imports nothing from the module, so it executes.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SOURCE = readFileSync('lib/ai/cos/localEmbeddings.ts', 'utf8')

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
