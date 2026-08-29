import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  boundedFreshSynthesisAttemptTimeoutMs,
  freshSynthesisNullIndicatesTimeout,
  FRESH_SYNTHESIS_MAX_ATTEMPTS,
  FRESH_SYNTHESIS_TIMEOUT_NULL_GRACE_MS,
  runFreshSynthesisTransportAttempts,
} from '../lib/ai/cos/freshEvidenceRetryPolicy.ts'

test('fresh synthesis uses two attempts and caps the global 120s timeout at 35s', () => {
  assert.equal(FRESH_SYNTHESIS_MAX_ATTEMPTS, 2)
  assert.equal(boundedFreshSynthesisAttemptTimeoutMs(120_000, undefined), 35_000)
  assert.equal(boundedFreshSynthesisAttemptTimeoutMs(20_000, undefined), 20_000)
  assert.equal(boundedFreshSynthesisAttemptTimeoutMs(120_000, 90_000), 60_000)
  assert.equal(boundedFreshSynthesisAttemptTimeoutMs(120_000, 1_000), 5_000)
})

test('one thrown transport timeout is retried once and can recover on the second local attempt', async () => {
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

test('the exact Production shape — null after the full 35s budget — is recognized as a swallowed timeout', () => {
  assert.equal(FRESH_SYNTHESIS_TIMEOUT_NULL_GRACE_MS, 250)
  assert.equal(freshSynthesisNullIndicatesTimeout(null, 35_005, 35_000), true)
  assert.equal(freshSynthesisNullIndicatesTimeout(null, 34_900, 35_000), true)
  assert.equal(freshSynthesisNullIndicatesTimeout(null, 34_700, 35_000), false)
  assert.equal(freshSynthesisNullIndicatesTimeout('answer', 35_005, 35_000), false)
})

test('a swallowed timeout can be converted to a retryable transport failure and recover', async () => {
  let calls = 0
  const elapsed = [35_005, 1_900]
  const rawValues: Array<string | null> = [null, 'grounded-json']
  const retries: number[] = []
  const result = await runFreshSynthesisTransportAttempts(async () => {
    const index = calls++
    const value = rawValues[index]
    if (freshSynthesisNullIndicatesTimeout(value, elapsed[index], 35_000)) {
      throw new Error('Local inference attempt exhausted its 35000ms timeout budget')
    }
    return value
  }, event => retries.push(event.attempt))

  assert.equal(result.value, 'grounded-json')
  assert.equal(result.attempts, 2)
  assert.equal(calls, 2)
  assert.deepEqual(retries, [1])
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

test('a completed fast null result is not treated as a transport failure and is not retried', async () => {
  let calls = 0
  const result = await runFreshSynthesisTransportAttempts(async () => {
    calls += 1
    const value = null
    assert.equal(freshSynthesisNullIndicatesTimeout(value, 120, 35_000), false)
    return value
  })
  assert.equal(result.value, null)
  assert.equal(result.attempts, 1)
  assert.equal(calls, 1)
})

test('production fresh synthesis is wired to recover swallowed timeouts before the evidence contract', () => {
  const source = readFileSync(new URL('../lib/ai/cos/freshEvidenceLocalSynthesis.ts', import.meta.url), 'utf8')
  assert.match(source, /runFreshSynthesisTransportAttempts/)
  assert.match(source, /boundedFreshSynthesisAttemptTimeoutMs/)
  assert.match(source, /freshSynthesisNullIndicatesTimeout/)
  assert.match(source, /attemptStartedAt = Date\.now\(\)/)
  assert.match(source, /exhausted its.*timeout budget/)
  assert.match(source, /cos-fresh-local-synthesis-retry/)
  assert.match(source, /acceptFreshEvidenceSynthesis/)
  assert.match(source, /if \(!accepted\) return \{ kind: 'citation_grounding_rejected' \}/)
  assert.doesNotMatch(source, /synthesizeFreshEvidenceExternally|callCosTextDetailed|modelPreference/)
})
