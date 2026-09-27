// saas/tests/localInferenceTransportFailureTag.node.test.ts
//
// 2026-09-27: the only active graduate failed 66/66 live calls with http_status=null and no stored reason (some in
// 2-5 ms), so the cause could not be found with a query. A transport failure now persists a short,
// credential-free failure class in provider_inference_usage.finish_reason.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transportFailureTag } from '../lib/ai/local-inference.ts'

test('a network failure keeps its low-level cause code', () => {
  const error = new TypeError('fetch failed', { cause: Object.assign(new Error('getaddrinfo'), { code: 'ENOTFOUND' }) })
  assert.equal(transportFailureTag(error), 'error:TypeError:fetch failed:ENOTFOUND')
})

test('an abort is named as an abort', () => {
  const error = new Error('This operation was aborted')
  error.name = 'AbortError'
  assert.equal(transportFailureTag(error), 'error:AbortError:This operation was aborted')
})

test('credentials never survive into the stored tag', () => {
  const tag = transportFailureTag(new Error('rejected Bearer sk-live-abc123 key=zzz token=yyy'))
  assert.doesNotMatch(tag, /sk-live-abc123|zzz|yyy/)
  assert.ok(tag.length <= 80)
})

test('non-Error throws and long messages stay bounded', () => {
  assert.match(transportFailureTag('plain string failure'), /^error:Error:plain string failure$/)
  assert.ok(transportFailureTag(new Error('x'.repeat(500))).length <= 80)
})

test('only failures without an HTTP response are tagged, and a real finish reason always wins', () => {
  const source = readFileSync(new URL('../lib/ai/local-inference.ts', import.meta.url), 'utf8')
  assert.match(source, /if \(httpStatus === null\) transportFailure = transportFailureTag\(error\)/)
  assert.match(source, /finishReason: finishReason \?\? transportFailure/)
})
