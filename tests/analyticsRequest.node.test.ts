import assert from 'node:assert/strict'
import test from 'node:test'
import { parseAnalyticsRequest } from '../lib/analytics/request.ts'
import { isPlatformOperator } from '../lib/auth/platformOperatorPolicy.ts'

test('analytics parser rejects malformed, unknown, and unsafe query input', () => {
  for (const input of [
    'not a URL',
    'https://example.test/api?organizationId=other-org',
    'https://example.test/api?startDate=2026-02-30',
    'https://example.test/api?startDate=2026-06-02&endDate=2026-06-01',
    'https://example.test/api?startDate=2026-01-01&endDate=2026-06-01',
    'https://example.test/api?region=US&region=CA',
  ]) assert.equal(parseAnalyticsRequest(input).ok, false)
})

test('analytics parser normalizes supported valid input', () => {
  assert.deepEqual(parseAnalyticsRequest('https://example.test/api?region=%20US%20&campaign=%20spring%20&startDate=2026-06-01&endDate=2026-06-30'), {
    ok: true,
    filters: { region: 'US', campaign: 'spring', startDate: '2026-06-01', endDate: '2026-06-30' },
  })
})

test('only trusted platform roles can access provider-wide analytics', () => {
  assert.equal(isPlatformOperator(null), false)
  assert.equal(isPlatformOperator({ email: 'marketing@example.test', app_metadata: { role: 'admin' } }), false)
  assert.equal(isPlatformOperator({ email: 'service@example.test', app_metadata: { role: 'service_role' } }), false)
  assert.equal(isPlatformOperator({ email: 'operator@example.test', app_metadata: { role: 'platform_operator' } }), true)
  assert.equal(isPlatformOperator({ email: 'owner@example.test', app_metadata: { role: 'owner' } }), true)
})
