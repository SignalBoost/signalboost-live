import type { RevenueEvent, RevenueEventSource, RevenueEventType } from './types.ts'
import {
  recordVerifiedCosProductionOutcome,
  type CosVerifiedOutcomeDomain,
  type CosVerifiedOutcomeStatus,
} from '@/lib/ai/cos/cognitiveVerifiedOutcome.ts'

const AI_PROVIDER = /(?:openai|anthropic|claude|gemini|qwen|ollama|mistral|grok|cohere)/i

const OBSERVED_TYPES = new Set<RevenueEventType>([
  'email_sent',
  'email_opened',
  'email_clicked',
  'reply_received',
  'opportunity_created',
  'opportunity_advanced',
])

const SUCCESS_TYPES = new Set<RevenueEventType>([
  'meeting_booked',
  'meeting_completed',
  'opportunity_won',
  'invoice_paid',
  'renewal_completed',
])

const FAILURE_TYPES = new Set<RevenueEventType>(['opportunity_lost'])

export type RevenueOutcomeLearningDecision = {
  eligible: boolean
  reason: string
  domain: CosVerifiedOutcomeDomain | null
  status: CosVerifiedOutcomeStatus | null
  summary: string | null
  problemClass: 'B2B enterprise sales marketing revenue operations'
  facts: Record<string, unknown>
}

function domainFor(event: RevenueEvent): CosVerifiedOutcomeDomain {
  if (event.source === 'crm_hub') return 'crm'
  if (['email_sent', 'email_opened', 'email_clicked', 'reply_received'].includes(event.type)) return 'campaign'
  return 'sales'
}

function sourceIsAuthoritative(source: RevenueEventSource): boolean {
  return source !== 'manual'
}

function statusFor(type: RevenueEventType): CosVerifiedOutcomeStatus | null {
  if (SUCCESS_TYPES.has(type)) return 'success'
  if (FAILURE_TYPES.has(type)) return 'failure'
  if (OBSERVED_TYPES.has(type)) return 'observed'
  return null
}

function eventSummary(event: RevenueEvent, status: CosVerifiedOutcomeStatus): string {
  const label = event.type.replaceAll('_', ' ')
  if (status === 'success') return `Authoritative revenue event confirmed successful milestone: ${label}.`
  if (status === 'failure') return `Authoritative revenue event confirmed unsuccessful terminal milestone: ${label}.`
  return `Authoritative revenue event observed business progress signal: ${label}.`
}

/**
 * Revenue events are useful learning evidence only when they represent objective business state.
 * Manual events, AI-provider claims and non-outcome enrichment/creation events are deliberately
 * excluded. Intermediate engagement signals remain observed rather than being mislabeled success.
 */
export function decideRevenueEventOutcomeLearning(event: RevenueEvent): RevenueOutcomeLearningDecision {
  const base = {
    problemClass: 'B2B enterprise sales marketing revenue operations' as const,
    facts: {
      eventId: event.eventId,
      eventType: event.type,
      eventSource: event.source,
      sourceProvider: event.sourceProvider || null,
      campaignId: event.campaign?.id || null,
      opportunityId: event.opportunityId || null,
      pipelineId: event.pipelineId || null,
      correlationId: event.correlationId || null,
      value: event.value ?? null,
      currency: event.currency || null,
      confidence: event.confidence,
    },
  }

  if (!sourceIsAuthoritative(event.source)) {
    return { eligible: false, reason: 'manual_source_not_verified', domain: null, status: null, summary: null, ...base }
  }
  if (event.sourceProvider && AI_PROVIDER.test(event.sourceProvider)) {
    return { eligible: false, reason: 'ai_provider_not_business_outcome_authority', domain: null, status: null, summary: null, ...base }
  }

  const status = statusFor(event.type)
  if (!status) {
    return { eligible: false, reason: 'event_not_business_outcome_signal', domain: null, status: null, summary: null, ...base }
  }

  // A terminal success/failure is strong evidence only when the originating system reports it as
  // certain. Lower-confidence terminal events remain in the revenue ledger but do not teach COS.
  if (status !== 'observed' && event.confidence < 1) {
    return { eligible: false, reason: 'terminal_outcome_not_certain', domain: null, status: null, summary: null, ...base }
  }

  // Universal/external adapters need an explicit evidence reference. Internal hubs are already the
  // authoritative state boundary for their own accepted events.
  if (['universal_adapter', 'external_provider'].includes(event.source) && event.evidenceRefs.length === 0) {
    return { eligible: false, reason: 'external_event_missing_evidence_ref', domain: null, status: null, summary: null, ...base }
  }

  const domain = domainFor(event)
  return {
    eligible: true,
    reason: 'verified_revenue_event',
    domain,
    status,
    summary: eventSummary(event, status),
    ...base,
  }
}

/**
 * Feed one already-accepted canonical RevenueEvent into COS outcome learning.
 * Event persistence/acceptance must happen before this function is called.
 */
export async function recordVerifiedRevenueEventOutcome(event: RevenueEvent): Promise<{
  eligible: boolean
  stored: boolean
  inserted: boolean
  reason: string
}> {
  const decision = decideRevenueEventOutcomeLearning(event)
  if (!decision.eligible || !decision.domain || !decision.status || !decision.summary) {
    return { eligible: false, stored: false, inserted: false, reason: decision.reason }
  }

  const recorded = await recordVerifiedCosProductionOutcome({
    sourceClass: 'authoritative_record',
    sourceRef: `revenue-event:${event.eventId}`,
    domain: decision.domain,
    outcomeStatus: decision.status,
    summary: decision.summary,
    problemClass: decision.problemClass,
    facts: decision.facts,
    correlation: event.correlationId ? { kind: 'revenue_correlation_id', value: event.correlationId } : null,
    idempotencyKey: `revenue-event:${event.eventId}`,
    occurredAt: event.occurredAt,
  })

  return {
    eligible: true,
    stored: recorded.stored,
    inserted: recorded.inserted,
    reason: decision.reason,
  }
}
