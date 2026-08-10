import type { RevenueEvent } from '../events/types.ts'
import type { RevenueAttribution, RevenueCurrencyMetrics, RevenueForecast, RevenueFunnel, RevenueHubInput, RevenueIntelligenceSnapshot } from './types.ts'

function tenantKey(event: RevenueEvent): string {
  return `${event.tenant.tenantId}:${event.tenant.environmentId}`
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0
}

function metadataNumber(event: RevenueEvent, key: string): number {
  const value = event.metadata[key]
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
}

function probability(event: RevenueEvent): number {
  const raw = metadataNumber(event, 'probability')
  if (raw <= 1) return raw
  return Math.min(1, raw / 100)
}

function currencyOf(event: RevenueEvent): string | null {
  return event.currency || null
}

function financialMap(events: readonly RevenueEvent[], selector: (event: RevenueEvent) => boolean): Map<string, number> {
  const map = new Map<string, number>()
  for (const event of events) {
    if (!selector(event) || event.value === undefined || !event.currency) continue
    map.set(event.currency, (map.get(event.currency) || 0) + event.value)
  }
  return map
}

function buildFunnel(events: readonly RevenueEvent[]): RevenueFunnel {
  const count = (type: RevenueEvent['type']) => events.filter(event => event.type === type).length
  const leads = count('lead_created')
  const contacts = count('contact_created')
  const emailsSent = count('email_sent')
  const replies = count('reply_received')
  const meetingsBooked = count('meeting_booked')
  const meetingsCompleted = count('meeting_completed')
  const opportunitiesCreated = count('opportunity_created')
  const opportunitiesWon = count('opportunity_won')
  const opportunitiesLost = count('opportunity_lost')
  return {
    leads,
    contacts,
    emailsSent,
    replies,
    meetingsBooked,
    meetingsCompleted,
    opportunitiesCreated,
    opportunitiesWon,
    opportunitiesLost,
    replyRate: ratio(replies, emailsSent),
    meetingRate: ratio(meetingsBooked, replies || emailsSent),
    winRate: ratio(opportunitiesWon, opportunitiesWon + opportunitiesLost),
  }
}

function latestOpportunityEvents(events: readonly RevenueEvent[]): RevenueEvent[] {
  const byOpportunity = new Map<string, RevenueEvent>()
  for (const event of events) {
    if (!event.opportunityId) continue
    if (!['opportunity_created', 'opportunity_advanced', 'opportunity_won', 'opportunity_lost'].includes(event.type)) continue
    const current = byOpportunity.get(event.opportunityId)
    if (!current || Date.parse(event.occurredAt) > Date.parse(current.occurredAt)) byOpportunity.set(event.opportunityId, event)
  }
  return [...byOpportunity.values()]
}

function buildCurrencyMetrics(events: readonly RevenueEvent[]): RevenueCurrencyMetrics[] {
  const currencies = new Set(events.map(currencyOf).filter((value): value is string => Boolean(value)))
  const latest = latestOpportunityEvents(events)
  const rows: RevenueCurrencyMetrics[] = []
  for (const currency of [...currencies].sort()) {
    const realizedRevenue = events.filter(event => event.currency === currency && ['invoice_paid', 'renewal_completed'].includes(event.type)).reduce((sum, event) => sum + (event.value || 0), 0)
    const wonValue = events.filter(event => event.currency === currency && event.type === 'opportunity_won').reduce((sum, event) => sum + (event.value || 0), 0)
    const open = latest.filter(event => event.currency === currency && !['opportunity_won', 'opportunity_lost'].includes(event.type))
    const openPipelineValue = open.reduce((sum, event) => sum + (event.value || 0), 0)
    const weightedPipelineValue = open.reduce((sum, event) => sum + (event.value || 0) * probability(event), 0)
    const recordedCost = events.filter(event => event.currency === currency).reduce((sum, event) => sum + metadataNumber(event, 'cost') + metadataNumber(event, 'spend'), 0)
    rows.push({
      currency,
      realizedRevenue,
      wonValue,
      openPipelineValue,
      weightedPipelineValue,
      recordedCost,
      roi: recordedCost > 0 ? (realizedRevenue - recordedCost) / recordedCost : null,
    })
  }
  return rows
}

function buildAttribution(events: readonly RevenueEvent[]): RevenueAttribution[] {
  const groups = new Map<string, RevenueEvent[]>()
  for (const event of events) {
    const key = event.campaign?.id || event.correlationId
    if (!key) continue
    const group = groups.get(key) || []
    group.push(event)
    groups.set(key, group)
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, group]) => {
    const realized = financialMap(group, event => ['invoice_paid', 'renewal_completed'].includes(event.type))
    const won = financialMap(group, event => event.type === 'opportunity_won')
    const cost = new Map<string, number>()
    for (const event of group) {
      if (!event.currency) continue
      const amount = metadataNumber(event, 'cost') + metadataNumber(event, 'spend')
      if (amount) cost.set(event.currency, (cost.get(event.currency) || 0) + amount)
    }
    const first = group[0]
    return {
      key,
      ...(first.campaign?.id ? { campaignId: first.campaign.id } : {}),
      ...(first.correlationId ? { correlationId: first.correlationId } : {}),
      eventIds: group.map(event => event.eventId).sort(),
      realizedRevenue: Object.fromEntries([...realized.entries()].sort()),
      wonValue: Object.fromEntries([...won.entries()].sort()),
      cost: Object.fromEntries([...cost.entries()].sort()),
    }
  })
}

function buildForecasts(metrics: readonly RevenueCurrencyMetrics[], winRate: number): RevenueForecast[] {
  return metrics.map(metric => ({
    currency: metric.currency,
    openPipelineValue: metric.openPipelineValue,
    weightedPipelineValue: metric.weightedPipelineValue,
    historicalWinRate: winRate,
    probabilityAdjustedForecast: metric.weightedPipelineValue > 0 ? metric.weightedPipelineValue : metric.openPipelineValue * winRate,
  }))
}

function salesCycleDays(events: readonly RevenueEvent[]): number | null {
  const starts = new Map<string, number>()
  const durations: number[] = []
  for (const event of events) {
    if (!event.opportunityId) continue
    if (event.type === 'opportunity_created') starts.set(event.opportunityId, Date.parse(event.occurredAt))
    if (['opportunity_won', 'opportunity_lost'].includes(event.type) && starts.has(event.opportunityId)) {
      const duration = Date.parse(event.occurredAt) - (starts.get(event.opportunityId) || 0)
      if (duration >= 0) durations.push(duration / 86_400_000)
    }
  }
  if (!durations.length) return null
  return durations.reduce((sum, value) => sum + value, 0) / durations.length
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested)
  return value
}

export function buildRevenueIntelligence(input: RevenueHubInput): RevenueIntelligenceSnapshot {
  const key = `${input.tenant.tenantId}:${input.tenant.environmentId}`
  if (!input.tenant.tenantId || !input.tenant.environmentId) throw new Error('tenant_required')
  const seen = new Set<string>()
  const events = [...input.events]
  for (const event of events) {
    if (tenantKey(event) !== key) throw new Error('revenue_event_tenant_boundary_violation')
    if (seen.has(event.eventId)) throw new Error('duplicate_revenue_event_id')
    seen.add(event.eventId)
  }
  events.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.eventId.localeCompare(b.eventId))
  const funnel = buildFunnel(events)
  const currencies = buildCurrencyMetrics(events)
  const snapshot: RevenueIntelligenceSnapshot = {
    schemaVersion: '1.0.0',
    tenant: { ...input.tenant },
    generatedAt: input.generatedAt || new Date().toISOString(),
    eventCount: events.length,
    eventIds: events.map(event => event.eventId),
    funnel,
    currencies,
    attribution: buildAttribution(events),
    forecasts: buildForecasts(currencies, funnel.winRate),
    averageSalesCycleDays: salesCycleDays(events),
    evidenceRefs: [...new Set(events.flatMap(event => event.evidenceRefs))].sort(),
  }
  return deepFreeze(snapshot)
}
