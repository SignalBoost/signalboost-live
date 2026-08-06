import assert from 'node:assert/strict'
import test from 'node:test'

import { executeProviderLiveDataRead } from '../provider-hub-core/live-data-read-adapter.ts'

const request = {
  tenantId: 'tenant-1',
  environmentId: 'staging',
  connectionId: 'connection-1',
  providerId: 'youtube',
  capability: 'read:channel-statistics',
  sourceUrl: 'https://www.googleapis.com/youtube/v3/channels?part=statistics&id=channel-1',
  observedAt: '2026-07-26T19:00:30.000Z',
  timeoutMs: 5_000,
}

const digest = {
  async sha256(value: string) {
    return value === '' ? '0'.repeat(64) : 'a'.repeat(64)
  },
}

test('Provider Hub live-data adapter performs injected GET reads in staging and emits immutable evidence', async () => {
  const calls: unknown[] = []
  const result = await executeProviderLiveDataRead(request, {
    executionMode: 'staging',
    now: () => '2026-07-26T19:00:00.000Z',
    digest,
    transport: {
      async get(input) {
        calls.push(input)
        return {
          status: 200,
          body: '{"items":[{"statistics":{"viewCount":"10"}}]}',
          headers: {
            etag: 'public-etag',
            'x-result-count': '1',
            'x-ratelimit-limit': '10000',
            'x-ratelimit-remaining': '9999',
            'x-ratelimit-reset-at': '2026-07-27T00:00:00.000Z',
          },
        }
      },
    },
  })

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], { url: request.sourceUrl, timeoutMs: 5_000 })
  assert.equal(result.executionMode, 'staging')
  assert.equal(result.transportInvoked, true)
  assert.equal(result.method, 'GET')
  assert.equal(result.evidence.state, 'validated')
  assert.equal(result.evidence.httpStatus, 200)
  assert.equal(result.evidence.resultCount, 1)
  assert.equal(result.evidence.dataSha256, 'a'.repeat(64))
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.evidence))
})

test('Provider Hub live-data adapter fails closed for production execution and credential-shaped URLs', async () => {
  const transport = { async get() { throw new Error('must not run') } }

  await assert.rejects(
    executeProviderLiveDataRead(request, {
      executionMode: 'production',
      now: () => '2026-07-26T19:00:00.000Z',
      digest,
      transport,
    }),
    /production-authorization-required/,
  )

  await assert.rejects(
    executeProviderLiveDataRead(
      { ...request, sourceUrl: 'https://example.com/data?api_key=EXAMPLE_NOTAREAL_KEY' },
      { executionMode: 'test', now: () => '2026-07-26T19:00:00.000Z', digest, transport },
    ),
    /credential-shaped-source/,
  )
})

test('Provider Hub live-data adapter converts transport failures into deterministic read evidence', async () => {
  const result = await executeProviderLiveDataRead(request, {
    executionMode: 'test',
    now: () => '2026-07-26T19:00:00.000Z',
    digest,
    transport: { async get() { throw new Error('offline') } },
  })

  assert.equal(result.transportInvoked, true)
  assert.equal(result.evidence.state, 'validated')
  assert.equal(result.evidence.httpStatus, 503)
  assert.equal(result.evidence.resultCount, 0)
  assert.equal(result.evidence.failureCode, 'transport_failure')
  assert.equal(result.evidence.dataSha256, '0'.repeat(64))
})

test('Provider Hub live-data adapter bounds timeout and rejects unsafe URL authority', async () => {
  const options = {
    executionMode: 'test' as const,
    now: () => '2026-07-26T19:00:00.000Z',
    digest,
    transport: { async get() { return { status: 200, body: '{}' } } },
  }

  await assert.rejects(executeProviderLiveDataRead({ ...request, timeoutMs: 30_001 }, options), /invalid-timeout/)
  await assert.rejects(
    executeProviderLiveDataRead({ ...request, sourceUrl: 'https://user:password@example.com/data' }, options),
    /invalid-source-url/,
  )
})
