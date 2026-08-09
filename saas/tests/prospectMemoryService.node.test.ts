import assert from 'node:assert/strict'
import test from 'node:test'
import { PROSPECT_FRESHNESS_POLICY, expiresAtFor, isFresh } from '../lib/prospect-intelligence/memory.ts'

const DAY = 24 * 60 * 60 * 1000

test('prospect freshness policies keep volatile data shorter-lived', () => {
  assert.equal(PROSPECT_FRESHNESS_POLICY.businessEmailMs, 30 * DAY)
  assert.equal(PROSPECT_FRESHNESS_POLICY.buyerRoleMs, 60 * DAY)
  assert.equal(PROSPECT_FRESHNESS_POLICY.technologyProfileMs, 90 * DAY)
  assert.equal(PROSPECT_FRESHNESS_POLICY.companyProfileMs, 180 * DAY)
})

test('expiresAtFor produces fresh values until the TTL elapses', () => {
  const verified = new Date('2026-08-09T12:00:00.000Z')
  const expiresAt = expiresAtFor('businessEmailMs' as never, verified)
  assert.equal(typeof expiresAt, 'string')
  assert.equal(isFresh(expiresAt, verified.getTime() + 29 * DAY), true)
  assert.equal(isFresh(expiresAt, verified.getTime() + 31 * DAY), false)
})
