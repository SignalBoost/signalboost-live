import assert from 'node:assert/strict'
import test from 'node:test'

import { buildRevenueEvent } from '../lib/revenue/events/index.ts'
import { buildRevenueIntelligence, buildRevenueLearningPayload, buildRevenueOptimizationSignals } from '../lib/revenue/hub/index.ts'

const tenant = { tenantId: 'tenant-a', environmentId: 'prod', region: 'us' }
const at = (day: number) => `2026-08-${String(day).padStart(2, '0')}T12:00:00.000Z`

function event(eventId: string, type: Parameters<typeof buildRevenueEvent>[0]['type'], day: number, extra: Partial<Parameters<typeof buildRevenueEvent>[0]> = {}) {
  return buildRevenueEvent({
    eventId,
    tenant,
    occurredAt: at(day),
    type,
    source: 'revenue_hub',
    evidenceRefs: [`evidence:${eventId}`],
    ...extra,
  }, at(day))
}

test('revenue hub builds funnel, ROI, attribution, forecast, and sales cycle', () => {
  const events = [
    event('lead-1', 'lead_created', 1, { correlationId: 'campaign-1' }),
    event('mail-1', 'email_sent', 1, { correlationId: 'campaign-1', value: 100, currency: 'USD', metadata: { cost: 100 } }),
    event('reply-1', 'reply_received', 2, { correlationId: 'campaign-1' }),
    event('meeting-1', 'meeting_booked', 3, { correlationId: 'campaign-1' }),
    event('opp-1', 'opportunity_created', 4, { correlationId: 'campaign-1', opportunityId: 'opp-a', value: 1000, currency: 'USD', metadata: { probability: 25 } }),
    event('opp-2', 'opportunity_won', 8, { correlationId: 'campaign-1', opportunityId: 'opp-a', value: 1000, currency: 'USD' }),
    event('invoice-1', 'invoice_paid', 9, { correlationId: 'campaign-1', opportunityId: 'opp-a', value: 1000, currency: 'USD' }),
  ]
  const snapshot = buildRevenueIntelligence({ tenant, events, generatedAt: at(10) })

  assert.equal(snapshot.funnel.replyRate, 1)
  assert.equal(snapshot.funnel.meetingRate, 1)
  assert.equal(snapshot.funnel.winRate, 1)
  assert.equal(snapshot.currencies[0]?.realizedRevenue, 1000)
  assert.equal(snapshot.currencies[0]?.wonValue, 1000)
  assert.equal(snapshot.currencies[0]?.recordedCost, 100)
  assert.equal(snapshot.currencies[0]?.roi, 9)
  assert.equal(snapshot.attribution[0]?.realizedRevenue.USD, 1000)
  assert.equal(snapshot.averageSalesCycleDays, 4)
  assert.equal(Object.isFrozen(snapshot), true)

  const signals = buildRevenueOptimizationSignals(snapshot)
  assert.equal(signals.some(signal => signal.metric === 'roi' && signal.value === 9), true)
  assert.equal(buildRevenueLearningPayload(snapshot).revenue.eventCount, events.length)
})

test('open opportunities create probability-adjusted forecasts', () => {
  const snapshot = buildRevenueIntelligence({
    tenant,
    events: [event('opp-open', 'opportunity_created', 1, { opportunityId: 'open-a', value: 2000, currency: 'USD', metadata: { probability: 40 } })],
  })
  assert.equal(snapshot.currencies[0]?.openPipelineValue, 2000)
  assert.equal(snapshot.currencies[0]?.weightedPipelineValue, 800)
  assert.equal(snapshot.forecasts[0]?.probabilityAdjustedForecast, 800)
})

test('revenue hub rejects cross-tenant and duplicate events', () => {
  const good = event('same', 'lead_created', 1)
  const otherTenant = buildRevenueEvent({ ...good, eventId: 'other', tenant: { tenantId: 'tenant-b', environmentId: 'prod' } })
  assert.throws(() => buildRevenueIntelligence({ tenant, events: [good, otherTenant] }), /tenant_boundary/)
  assert.throws(() => buildRevenueIntelligence({ tenant, events: [good, good] }), /duplicate_revenue_event_id/)
})
