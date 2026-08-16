import test from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'

import { buildRevenueEvent } from '../lib/revenue/events/revenue-event.ts'
import { acceptAuthoritativeRevenueEvent } from '../lib/revenue/events/authoritative-ingest.ts'
import type { CosVerifiedProductionOutcomeInput } from '../lib/ai/cos/cognitiveVerifiedOutcome.ts'

function revenueEvent(source: 'crm_hub' | 'manual' = 'crm_hub') {
  return buildRevenueEvent({
    eventId: 'evt-opportunity-won-1',
    tenant: { tenantId: 'tenant-1', environmentId: 'test' },
    occurredAt: '2026-08-16T18:00:00.000Z',
    type: 'opportunity_won',
    source,
    confidence: 1,
    evidenceRefs: ['crm:opportunity-1'],
    opportunityId: 'opportunity-1',
  })
}

function fakeDb(error: unknown = null, capture?: (table: string, payload: unknown) => void): SupabaseClient {
  return {
    from(table: string) {
      return {
        async insert(payload: unknown) {
          capture?.(table, payload)
          return { error }
        },
      }
    },
  } as unknown as SupabaseClient
}

test('durable ledger insert happens before COS recording', async () => {
  const order: string[] = []
  let learnedInput: CosVerifiedProductionOutcomeInput | undefined
  const result = await acceptAuthoritativeRevenueEvent(
    fakeDb(null, (table, payload) => {
      order.push(`persist:${table}`)
      assert.equal((payload as { event_id?: string }).event_id, 'evt-opportunity-won-1')
    }),
    revenueEvent(),
    {
      recordOutcome: async input => {
        order.push('learn')
        learnedInput = input
        return { stored: true, inserted: true }
      },
    },
  )

  assert.deepEqual(order, ['persist:revenue_events', 'learn'])
  assert.equal(result.accepted, true)
  assert.equal(result.inserted, true)
  assert.equal(result.cosInserted, true)
  assert.equal(learnedInput?.outcomeStatus, 'success')
  assert.equal(learnedInput?.problemClass, 'sales and revenue operations')
  assert.equal(learnedInput?.sourceRef, 'revenue_event:evt-opportunity-won-1')
})

test('duplicate immutable event is idempotently accepted and may retry COS recording', async () => {
  let attempts = 0
  const result = await acceptAuthoritativeRevenueEvent(
    fakeDb({ code: '23505', message: 'duplicate key' }),
    revenueEvent(),
    {
      recordOutcome: async () => {
        attempts += 1
        return { stored: true, inserted: false }
      },
    },
  )

  assert.equal(result.accepted, true)
  assert.equal(result.inserted, false)
  assert.equal(result.cosAttempted, true)
  assert.equal(attempts, 1)
})

test('non-idempotency persistence failure stops before COS learning', async () => {
  let attempts = 0
  await assert.rejects(
    acceptAuthoritativeRevenueEvent(
      fakeDb({ code: '42501', message: 'permission denied' }),
      revenueEvent(),
      {
        recordOutcome: async () => {
          attempts += 1
          return { stored: true, inserted: true }
        },
      },
    ),
  )
  assert.equal(attempts, 0)
})

test('COS recording failure never reverses an accepted ledger event', async () => {
  const result = await acceptAuthoritativeRevenueEvent(
    fakeDb(),
    revenueEvent(),
    { recordOutcome: async () => { throw new Error('cos unavailable') } },
  )

  assert.equal(result.accepted, true)
  assert.equal(result.inserted, true)
  assert.equal(result.cosAttempted, true)
  assert.equal(result.cosStored, false)
  assert.match(result.cosError || '', /cos unavailable/)
})

test('manual business record persists for audit but does not teach COS', async () => {
  let attempts = 0
  const result = await acceptAuthoritativeRevenueEvent(
    fakeDb(),
    revenueEvent('manual'),
    {
      recordOutcome: async () => {
        attempts += 1
        return { stored: true, inserted: true }
      },
    },
  )

  assert.equal(result.accepted, true)
  assert.equal(result.inserted, true)
  assert.equal(result.cosAttempted, false)
  assert.equal(attempts, 0)
})
