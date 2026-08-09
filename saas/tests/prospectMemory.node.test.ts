// saas/tests/prospectMemory.node.test.ts
// Pure tests for prospect memory freshness rules. No DB/network.

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PROSPECT_FRESHNESS_POLICY,
  expiresAtFor,
  fieldsNeedingRefresh,
  isFresh,
} from '../lib/prospect-intelligence/memory.ts'

test('prospect freshness policy keeps volatile fields shorter-lived than company profiles', () => {
  assert.ok(PROSPECT_FRESHNESS_POLICY.businessEmailMs < PROSPECT_FRESHNESS_POLICY.companyProfileMs)
  assert.ok(PROSPECT_FRESHNESS_POLICY.recentNewsMs < PROSPECT_FRESHNESS_POLICY.technologyProfileMs)
})

test('expiresAtFor derives deterministic TTL from verification time', () => {
  const verified = new Date('2026-08-09T12:00:00.000Z')
  const emailExpiry = new Date(expiresAtFor('businessEmail', verified)).getTime()
  assert.equal(emailExpiry - verified.getTime(), PROSPECT_FRESHNESS_POLICY.businessEmailMs)
})

test('isFresh rejects missing, invalid, and expired values', () => {
  const now = Date.parse('2026-08-09T12:00:00.000Z')
  assert.equal(isFresh(null, now), false)
  assert.equal(isFresh('not-a-date', now), false)
  assert.equal(isFresh('2026-08-09T11:59:59.000Z', now), false)
  assert.equal(isFresh('2026-08-09T12:00:01.000Z', now), true)
})

test('fieldsNeedingRefresh returns only stale or expired field keys', () => {
  const now = Date.parse('2026-08-09T12:00:00.000Z')
  const fields = fieldsNeedingRefresh([
    { field_key: 'business_email', status: 'fresh', expires_at: '2026-08-10T12:00:00.000Z' },
    { field_key: 'technology_profile', status: 'stale', expires_at: '2026-09-10T12:00:00.000Z' },
    { field_key: 'buyer_role', status: 'fresh', expires_at: '2026-08-09T11:00:00.000Z' },
    { field_key: 'recent_news', status: 'invalidated', expires_at: '2026-08-20T12:00:00.000Z' },
  ], now)

  assert.deepEqual(fields, ['technology_profile', 'buyer_role', 'recent_news'])
})
