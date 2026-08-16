import test from 'node:test'
import assert from 'node:assert/strict'

import { buildRevenueEvent } from '../lib/revenue/events/revenue-event.ts'
import { decideRevenueCosOutcome } from '../lib/revenue/events/cos-outcome-policy.ts'
import type { RevenueEventInput, RevenueEventType, RevenueEventSource } from '../lib/revenue/events/types.ts'

function event(
  type: RevenueEventType,
  overrides: Partial<RevenueEventInput> = {},
) {
  return buildRevenueEvent({
    eventId: `evt_${type}`,
    tenant: { tenantId: 'tenant-1', environmentId: 'test' },
    occurredAt: '2026-08-16T18:00:00.000Z',
    type,
    source: 'crm_hub',
    confidence: 1,
    evidenceRefs: ['crm:record-1'],
    ...overrides,
  })
}

test('provider-confirmed send, reply and meeting are observations, never business success', () => {
  const send = decideRevenueCosOutcome(event('email_sent', {
    source: 'external_provider',
    sourceProvider: 'resend',
    evidenceRefs: ['outreach_send:123'],
  }))
  const reply = decideRevenueCosOutcome(event('reply_received'))
  const meeting = decideRevenueCosOutcome(event('meeting_booked'))

  assert.equal(send.eligible, true)
  assert.equal(send.domain, 'campaign')
  assert.equal(send.outcomeStatus, 'observed')
  assert.equal(reply.domain, 'sales')
  assert.equal(reply.outcomeStatus, 'observed')
  assert.equal(meeting.outcomeStatus, 'observed')
})

test('only evidenced certain terminal milestones become success or failure', () => {
  assert.equal(decideRevenueCosOutcome(event('opportunity_won')).outcomeStatus, 'success')
  assert.equal(decideRevenueCosOutcome(event('opportunity_lost')).outcomeStatus, 'failure')
  assert.equal(decideRevenueCosOutcome(event('invoice_paid')).outcomeStatus, 'success')
  assert.equal(decideRevenueCosOutcome(event('renewal_completed')).outcomeStatus, 'success')

  assert.equal(decideRevenueCosOutcome(event('opportunity_won', { confidence: 0.99 })).outcomeStatus, 'observed')
  assert.equal(decideRevenueCosOutcome(event('opportunity_lost', { evidenceRefs: [] })).outcomeStatus, 'observed')
})

test('manual events never teach COS', () => {
  const decision = decideRevenueCosOutcome(event('opportunity_won', { source: 'manual' }))
  assert.equal(decision.eligible, false)
  assert.equal(decision.reason, 'manual_source_not_verified')
})

test('model-authored markers never qualify as verified business outcomes', () => {
  const providers: RevenueEventSource[] = ['crm_hub', 'external_provider']
  for (const source of providers) {
    const decision = decideRevenueCosOutcome(event('opportunity_won', {
      source,
      sourceProvider: 'openai',
      evidenceRefs: ['crm:record-1'],
    }))
    assert.equal(decision.eligible, false)
    assert.equal(decision.reason, 'model_authored_not_verified')
  }

  const metadataDecision = decideRevenueCosOutcome(event('invoice_paid', {
    metadata: { generatedBy: 'llm:council' },
  }))
  assert.equal(metadataDecision.eligible, false)
})

test('external and universal adapter events require an evidence reference', () => {
  for (const source of ['external_provider', 'universal_adapter'] as const) {
    const decision = decideRevenueCosOutcome(event('email_sent', {
      source,
      sourceProvider: 'salesforce',
      evidenceRefs: [],
    }))
    assert.equal(decision.eligible, false)
    assert.equal(decision.reason, 'external_source_requires_evidence')
  }
})

test('all eligible revenue outcomes use one bounded problem class while retaining domain', () => {
  for (const type of ['email_sent', 'reply_received', 'opportunity_won', 'invoice_paid'] as const) {
    const decision = decideRevenueCosOutcome(event(type))
    assert.equal(decision.problemClass, 'sales and revenue operations')
  }
  assert.equal(decideRevenueCosOutcome(event('opportunity_won')).domain, 'crm')
  assert.equal(decideRevenueCosOutcome(event('invoice_paid')).domain, 'sales')
})
