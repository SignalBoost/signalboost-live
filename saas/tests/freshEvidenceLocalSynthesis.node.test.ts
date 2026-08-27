import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  boundedFreshSynthesisAttemptTimeoutMs,
  FRESH_SYNTHESIS_MAX_ATTEMPTS,
  runFreshSynthesisTransportAttempts,
} from '../lib/ai/cos/freshEvidenceRetryPolicy.ts'

test('fresh synthesis uses two attempts and caps the global 120s timeout at 35s', () => {
  assert.equal(FRESH_SYNTHESIS_MAX_ATTEMPTS, 2)
  assert.equal(boundedFreshSynthesisAttemptTimeoutMs(120_000, undefined), 35_000)
  assert.equal(boundedFreshSynthesisAttemptTimeoutMs(20_000, undefined), 20_000)
  assert.equal(boundedFreshSynthesisAttemptTimeoutMs(120_000, 90_000), 60_000)
  assert.equal(boundedFreshSynthesisAttemptTimeoutMs(120_000, 1_000), 5_000)
})

test('one transport timeout is retried once and can recover on the second local attempt', async () => {
  let calls = 0
  const retries: Array<{ attempt: number; nextAttempt: number }> = []
  const result = await runFreshSynthesisTransportAttempts(async () => {
    calls += 1
    if (calls === 1) {
      const error = new Error('This operation was aborted')
      error.name = 'AbortError'
      throw error
    }
    return 'grounded-json'
  }, event => retries.push({ attempt: event.attempt, nextAttempt: event.nextAttempt }))

  assert.equal(result.value, 'grounded-json')
  assert.equal(result.attempts, 2)
  assert.equal(calls, 2)
  assert.deepEqual(retries, [{ attempt: 1, nextAttempt: 2 }])
})

test('two transport failures fail closed after exactly two local attempts', async () => {
  let calls = 0
  await assert.rejects(
    () => runFreshSynthesisTransportAttempts(async () => {
      calls += 1
      throw new Error('provider timeout')
    }),
    /provider timeout/,
  )
  assert.equal(calls, 2)
})

test('a completed null result is not treated as a transport failure and is not retried', async () => {
  let calls = 0
  const result = await runFreshSynthesisTransportAttempts(async () => {
    calls += 1
    return null
  })
  assert.equal(result.value, null)
  assert.equal(result.attempts, 1)
  assert.equal(calls, 1)
})

test('production fresh synthesis is wired to the bounded retry before the evidence contract', () => {
  const source = readFileSync(new URL('../lib/ai/cos/freshEvidenceLocalSynthesis.ts', import.meta.url), 'utf8')
  assert.match(source, /runFreshSynthesisTransportAttempts/)
  assert.match(source, /boundedFreshSynthesisAttemptTimeoutMs/)
  assert.match(source, /cos-fresh-local-synthesis-retry/)
  assert.match(source, /acceptFreshEvidenceSynthesis/)
  assert.match(source, /if \(!accepted\) return null/)
  assert.doesNotMatch(source, /external|gemini|anthropic/i)
})
