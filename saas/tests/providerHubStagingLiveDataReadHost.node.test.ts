import assert from 'node:assert/strict'
import test from 'node:test'

import { createSignalBoostStagingLiveDataReadHost } from '../provider-hub-host/staging-live-data-read-host.ts'

const request = {
  tenantId: 'tenant-1',
  environmentId: 'staging',
  connectionId: 'connection-1',
  providerId: 'youtube',
  capability: 'read:channel-statistics',
  sourceUrl: 'https://www.googleapis.com/youtube/v3/channels?part=statistics&id=channel-1',
  observedAt: '2026-07-26T19:30:30.000Z',
  timeoutMs: 5_000,
}

test('SignalBoost staging read host performs allowlisted GET and emits truthful immutable execution evidence', async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
  const host = createSignalBoostStagingLiveDataReadHost({
    executionMode: 'staging',
    allowedOrigins: ['https://www.googleapis.com'],
    now: () => '2026-07-26T19:30:00.000Z',
    fetchImpl: async (input, init) => {
      calls.push({ input, init })
      return new Response('{"items":[{"id":"channel-1"}]}', {
        status: 200,
        headers: {
          etag: 'public-etag',
          'x-result-count': '1',
          'x-ratelimit-limit': '10000',
          'x-ratelimit-remaining': '9999',
          'x-ratelimit-reset-at': '2026-07-27T00:00:00.000Z',
        },
      })
    },
  })

  const result = await host.execute(request)
  assert.equal(calls.length, 1)
  assert.equal(String(calls[0]?.input), request.sourceUrl)
  assert.equal(calls[0]?.init?.method, 'GET')
  assert.equal(calls[0]?.init?.cache, 'no-store')
  assert.equal(calls[0]?.init?.redirect, 'error')
  assert.equal(result.transportInvoked, true)
  assert.equal(result.method, 'GET')
  assert.equal(result.evidence.state, 'validated')
  assert.equal(result.evidence.resultCount, 1)
  assert.match(result.evidence.dataSha256, /^[a-f0-9]{64}$/)
  assert.equal(host.productionEnabled, false)
  assert.ok(Object.isFrozen(host))
  assert.ok(Object.isFrozen(host.allowedOrigins))
  assert.ok(Object.isFrozen(result))
})

test('SignalBoost staging read host blocks production and non-allowlisted origins before transport', async () => {
  assert.throws(
    () => createSignalBoostStagingLiveDataReadHost({ executionMode: 'production', allowedOrigins: ['https://example.com'] }),
    /production-live-data-read-host-disabled/,
  )

  let called = false
  const host = createSignalBoostStagingLiveDataReadHost({
    executionMode: 'test',
    allowedOrigins: ['https://example.com'],
    fetchImpl: async () => {
      called = true
      return new Response('{}', { status: 200 })
    },
  })
  await assert.rejects(host.execute(request), /source-origin-not-allowed/)
  assert.equal(called, false)
})

test('SignalBoost staging read host rejects malformed or duplicate allowlist origins', () => {
  assert.throws(
    () => createSignalBoostStagingLiveDataReadHost({ executionMode: 'test', allowedOrigins: [] }),
    /allowed-origins-required/,
  )
  assert.throws(
    () => createSignalBoostStagingLiveDataReadHost({ executionMode: 'test', allowedOrigins: ['http://example.com'] }),
    /invalid-allowed-origin/,
  )
  assert.throws(
    () => createSignalBoostStagingLiveDataReadHost({ executionMode: 'test', allowedOrigins: ['https://example.com', 'https://example.com'] }),
    /duplicate-allowed-origin/,
  )
})
