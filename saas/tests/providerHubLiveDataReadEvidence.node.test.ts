import assert from 'node:assert/strict'
import test from 'node:test'

import { createProviderLiveDataReadEvidence } from '../provider-hub-core/live-data-read-evidence.ts'

const base = {
  tenantId: 'tenant-1',
  environmentId: 'production',
  connectionId: 'connection-1',
  providerId: 'youtube',
  capability: 'read:channel-statistics',
  method: 'GET',
  sourceOrigin: 'https://www.googleapis.com',
  fetchedAt: '2026-07-26T18:00:00.000Z',
  observedAt: '2026-07-26T18:00:30.000Z',
  httpStatus: 200,
  resultCount: 1,
  dataSha256: 'a'.repeat(64),
  etag: 'public-etag',
  rateLimit: { limit: 10000, remaining: 9999, resetAt: '2026-07-27T00:00:00.000Z' },
  failureCode: null,
}

test('Provider Hub live-data read evidence is deterministic, immutable, and read-only', () => {
  const first = createProviderLiveDataReadEvidence(base)
  const second = createProviderLiveDataReadEvidence(base)
  assert.deepEqual(first, second)
  assert.equal(first.state, 'validated')
  assert.equal(first.freshnessSeconds, 30)
  assert.deepEqual(first.blockers, [])
  assert.equal(first.networkAccessPerformed, false)
  assert.equal(first.providerMutationPerformed, false)
  assert.equal(first.credentialsExposed, false)
  assert.equal(first.rawPayloadStored, false)
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.rateLimit))
  assert.ok(Object.isFrozen(first.blockers))
})

test('Provider Hub live-data read evidence fails closed for unsafe or malformed input', () => {
  const evidence = createProviderLiveDataReadEvidence({
    ...base,
    method: 'POST',
    sourceOrigin: 'https://user:EXAMPLE_NOTAREAL_PASSWORD@example.com/?api_key=EXAMPLE_NOTAREAL_KEY',
    observedAt: '2026-07-28T18:00:30.000Z',
    dataSha256: 'bad',
    httpStatus: 429,
    failureCode: null,
    rateLimit: { limit: 10, remaining: 11, resetAt: 'bad', extra: true },
    rawPayload: { secret: 'value' },
  })
  assert.equal(evidence.state, 'blocked')
  assert.deepEqual(evidence.blockers, [...evidence.blockers].sort())
  for (const blocker of [
    'credential-shaped-source', 'failure-code-required', 'invalid-data-sha256', 'invalid-freshness',
    'invalid-rate-reset-at', 'invalid-source-origin', 'method-must-be-get',
    'rate-remaining-exceeds-limit', 'unknown-key:rawPayload', 'unknown-rate-limit-key:extra',
  ]) assert.ok(evidence.blockers.includes(blocker), `missing blocker ${blocker}`)
})

test('Provider Hub live-data read evidence redacts unsafe ETags and rejects malformed rate-limit containers', () => {
  const unsafeEtag = createProviderLiveDataReadEvidence({ ...base, etag: 'api_key=EXAMPLE_NOTAREAL_PLAINTEXT_SECRET' })
  assert.equal(unsafeEtag.state, 'blocked')
  assert.ok(unsafeEtag.blockers.includes('invalid-etag'))
  assert.equal(unsafeEtag.etag, null)
  assert.equal(JSON.stringify(unsafeEtag).includes('EXAMPLE_NOTAREAL_PLAINTEXT_SECRET'), false)

  for (const rateLimit of ['invalid', 12, []]) {
    const malformed = createProviderLiveDataReadEvidence({ ...base, rateLimit })
    assert.equal(malformed.state, 'blocked')
    assert.ok(malformed.blockers.includes('invalid-rate-limit-container'))
  }
})

test('Provider Hub live-data read evidence requires coherent success and failure states', () => {
  const successWithFailure = createProviderLiveDataReadEvidence({ ...base, failureCode: 'quota_exceeded' })
  assert.ok(successWithFailure.blockers.includes('success-cannot-have-failure-code'))

  const failed = createProviderLiveDataReadEvidence({ ...base, httpStatus: 503, resultCount: 0, failureCode: 'provider_unavailable' })
  assert.equal(failed.state, 'validated')
  assert.equal(failed.failureCode, 'provider_unavailable')
})
