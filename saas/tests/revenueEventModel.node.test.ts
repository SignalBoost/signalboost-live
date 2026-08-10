import assert from 'node:assert/strict'
import test from 'node:test'

import { buildRevenueEvent, isRevenueEvent, type RevenueEventInput } from '../lib/revenue/events/index.ts'

const base = {
  eventId: 'rev_evt_001',
  tenant: { tenantId: 'tenant-a', environmentId: 'prod', region: 'us' },
  occurredAt: '2026-08-09T20:00:00.000Z',
  type: 'opportunity_won' as const,
  source: 'crm_hub' as const,
  sourceProvider: 'dynamics365',
  opportunityId: 'opp-123',
  value: 125000,
  currency: 'usd',
  metadata: { industry: 'software', stage: 'closed_won' },
  evidenceRefs: ['crm:opp-123', 'crm:opp-123', 'email:thread-7'],
  correlationId: 'campaign-44',
}

test('buildRevenueEvent normalizes and freezes a canonical event', () => {
  const event = buildRevenueEvent(base, '2026-08-09T20:00:01.000Z')

  assert.equal(event.schemaVersion, '1.0.0')
  assert.equal(event.receivedAt, '2026-08-09T20:00:01.000Z')
  assert.equal(event.currency, 'USD')
  assert.deepEqual(event.evidenceRefs, ['crm:opp-123', 'email:thread-7'])
  assert.equal(event.confidence, 1)
  assert.equal(Object.isFrozen(event), true)
  assert.equal(Object.isFrozen(event.tenant), true)
  assert.equal(Object.isFrozen(event.metadata), true)
  assert.equal(isRevenueEvent(event), true)
})

test('revenue events require tenant boundaries and valid timestamps', () => {
  assert.throws(() => buildRevenueEvent({ ...base, tenant: { tenantId: '', environmentId: 'prod' } }), /tenant_id_required/)
  assert.throws(() => buildRevenueEvent({ ...base, occurredAt: 'not-a-date' }), /occurred_at_invalid/)
})

test('runtime validation rejects unknown event types and sources', () => {
  assert.throws(
    () => buildRevenueEvent({ ...base, type: 'unknown_event' } as unknown as RevenueEventInput),
    /event_type_invalid/,
  )
  assert.throws(
    () => buildRevenueEvent({ ...base, source: 'unknown_source' } as unknown as RevenueEventInput),
    /event_source_invalid/,
  )
})

test('monetary values require a valid currency pair', () => {
  assert.throws(() => buildRevenueEvent({ ...base, currency: undefined }), /value_currency_pair_required/)
  assert.throws(() => buildRevenueEvent({ ...base, currency: 'US' }), /currency_invalid/)
  assert.throws(() => buildRevenueEvent({ ...base, value: -1 }), /value_invalid/)
})

test('confidence must be bounded and metadata must not carry secrets', () => {
  assert.throws(() => buildRevenueEvent({ ...base, confidence: 1.1 }), /confidence_invalid/)
  assert.throws(
    () => buildRevenueEvent({ ...base, metadata: { clientSecret: 'fake-test-secret' } }),
    /secret_shaped_metadata_rejected/,
  )
})

test('event lineage cannot point to itself', () => {
  assert.throws(() => buildRevenueEvent({ ...base, parentEventId: base.eventId }), /self_parent_event_rejected/)
})
