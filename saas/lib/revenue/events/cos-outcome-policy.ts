import type { RevenueEvent, RevenueEventType } from './types.ts'

export type RevenueCosOutcomeDomain = 'campaign' | 'sales' | 'crm'
export type RevenueCosOutcomeStatus = 'success' | 'failure' | 'observed'

export type RevenueCosOutcomeDecision = {
  eligible: boolean
  reason: string
  domain: RevenueCosOutcomeDomain
  problemClass: 'sales and revenue operations'
  outcomeStatus: RevenueCosOutcomeStatus
  summary: string
}

const TERMINAL_SUCCESS = new Set<RevenueEventType>([
  'opportunity_won',
  'invoice_paid',
  'renewal_completed',
])
const TERMINAL_FAILURE = new Set<RevenueEventType>(['opportunity_lost'])
const MODEL_MARKER = /(?:^|[:/_-])(model|llm|council|openai|anthropic|claude|gemini|frontier[_-]?teacher)(?:$|[:/_-])/i

function domainFor(type: RevenueEventType): RevenueCosOutcomeDomain {
  if (type === 'email_sent' || type === 'email_opened' || type === 'email_clicked') return 'campaign'
  if (type === 'reply_received' || type === 'meeting_booked' || type === 'meeting_completed') return 'sales'
  if (type.startsWith('opportunity_')) return 'crm'
  return 'sales'
}

function modelAuthored(event: RevenueEvent): boolean {
  const metadata = event.metadata as Record<string, unknown>
  const markers = [
    event.sourceProvider,
    metadata.authorship,
    metadata.generatedBy,
    metadata.generated_by,
    metadata.sourceKind,
    metadata.source_kind,
    ...event.evidenceRefs,
  ]
  return markers.some(value => typeof value === 'string' && MODEL_MARKER.test(value.trim()))
}

function humanType(type: RevenueEventType): string {
  return type.replaceAll('_', ' ')
}

/**
 * Decide how an already-accepted RevenueEvent may teach COS.
 *
 * Activity is evidence that something happened, not evidence that the business objective succeeded.
 * Only certain, evidenced terminal milestones can become success/failure. Manual/model-authored
 * events are never eligible, and external/universal adapters must carry an evidence reference.
 */
export function decideRevenueCosOutcome(event: RevenueEvent): RevenueCosOutcomeDecision {
  const domain = domainFor(event.type)
  const base = {
    domain,
    problemClass: 'sales and revenue operations' as const,
    summary: `Authoritative revenue event: ${humanType(event.type)}.`,
  }

  if (event.source === 'manual') {
    return { ...base, eligible: false, reason: 'manual_source_not_verified', outcomeStatus: 'observed' }
  }
  if (modelAuthored(event)) {
    return { ...base, eligible: false, reason: 'model_authored_not_verified', outcomeStatus: 'observed' }
  }
  if ((event.source === 'external_provider' || event.source === 'universal_adapter') && event.evidenceRefs.length === 0) {
    return { ...base, eligible: false, reason: 'external_source_requires_evidence', outcomeStatus: 'observed' }
  }

  const terminalSuccess = TERMINAL_SUCCESS.has(event.type)
  const terminalFailure = TERMINAL_FAILURE.has(event.type)
  if (!terminalSuccess && !terminalFailure) {
    return { ...base, eligible: true, reason: 'activity_is_observed_only', outcomeStatus: 'observed' }
  }

  if (event.confidence !== 1 || event.evidenceRefs.length === 0) {
    return { ...base, eligible: true, reason: 'terminal_outcome_not_fully_verified', outcomeStatus: 'observed' }
  }

  return {
    ...base,
    eligible: true,
    reason: 'terminal_outcome_verified',
    outcomeStatus: terminalSuccess ? 'success' : 'failure',
  }
}
