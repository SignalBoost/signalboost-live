import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRevenueEvent } from '../lib/revenue/events/revenue-event.ts'
import { decideRevenueEventOutcomeLearning } from '../lib/revenue/events/cos-outcome-learning.ts'
import type { RevenueEventSource, RevenueEventType } from '../lib/revenue/events/types.ts'

function event(type: RevenueEventType, source: RevenueEventSource, overrides: Record<string, unknown> = {}) {
  return buildRevenueEvent({
    eventId: `evt-${type}-${source}`,
    tenant: { tenantId: 'tenant-1', environmentId: 'production' },
    occurredAt: '2026-08-16T17:00:00.000Z',
    type,
    source,
    confidence: 1,
    evidenceRefs: ['authoritative:test-record'],
    ...overrides,
  } as any)
}

test('provider-confirmed email send is observed campaign evidence, not success', () => {
  const decision = decideRevenueEventOutcomeLearning(event('email_sent', 'communication_hub'))
  assert.equal(decision.eligible, true)
  assert.equal(decision.domain, 'campaign')
  assert.equal(decision.status, 'observed')
})

test('reply remains an observed engagement signal rather than business success', () => {
  const decision = decideRevenueEventOutcomeLearning(event('reply_received', 'communication_hub'))
  assert.equal(decision.eligible, true)
  assert.equal(decision.domain, 'campaign')
  assert.equal(decision.status, 'observed')
})

test('certain meeting and won/lost CRM milestones become terminal outcome evidence', () => {
  const meeting = decideRevenueEventOutcomeLearning(event('meeting_booked', 'revenue_hub'))
  const won = decideRevenueEventOutcomeLearning(event('opportunity_won', 'crm_hub', { opportunityId: 'opp-1' }))
  const lost = decideRevenueEventOutcomeLearning(event('opportunity_lost', 'crm_hub', { opportunityId: 'opp-2' }))

  assert.equal(meeting.status, 'success')
  assert.equal(meeting.domain, 'sales')
  assert.equal(won.status, 'success')
  assert.equal(won.domain, 'crm')
  assert.equal(lost.status, 'failure')
  assert.equal(lost.domain, 'crm')
})

test('terminal revenue outcomes below certainty do not teach COS', () => {
  const decision = decideRevenueEventOutcomeLearning(event('opportunity_won', 'crm_hub', {
    confidence: 0.8,
    opportunityId: 'opp-3',
  }))
  assert.equal(decision.eligible, false)
  assert.equal(decision.reason, 'terminal_outcome_not_certain')
})

test('manual and AI-provider claims cannot masquerade as verified business outcomes', () => {
  const manual = decideRevenueEventOutcomeLearning(event('opportunity_won', 'manual', { opportunityId: 'opp-4' }))
  const ai = decideRevenueEventOutcomeLearning(event('opportunity_won', 'external_provider', {
    sourceProvider: 'gemini-2.5-pro',
    opportunityId: 'opp-5',
  }))

  assert.equal(manual.eligible, false)
  assert.equal(manual.reason, 'manual_source_not_verified')
  assert.equal(ai.eligible, false)
  assert.equal(ai.reason, 'ai_provider_not_business_outcome_authority')
})

test('external adapters require evidence references before their events can teach COS', () => {
  const missingEvidence = decideRevenueEventOutcomeLearning(event('meeting_completed', 'external_provider', {
    evidenceRefs: [],
  }))
  const evidenced = decideRevenueEventOutcomeLearning(event('meeting_completed', 'external_provider', {
    evidenceRefs: ['calendar-event:abc123'],
  }))

  assert.equal(missingEvidence.eligible, false)
  assert.equal(missingEvidence.reason, 'external_event_missing_evidence_ref')
  assert.equal(evidenced.eligible, true)
  assert.equal(evidenced.status, 'success')
})

test('creation and enrichment events are not treated as real-world outcome signals', () => {
  for (const type of ['lead_created', 'contact_created', 'prospect_enriched'] as const) {
    const decision = decideRevenueEventOutcomeLearning(event(type, 'prospect_hub'))
    assert.equal(decision.eligible, false)
    assert.equal(decision.reason, 'event_not_business_outcome_signal')
  }
})
