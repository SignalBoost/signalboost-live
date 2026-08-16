import type { SupabaseClient } from '@supabase/supabase-js'
import {
  recordVerifiedCosProductionOutcome,
  type CosVerifiedProductionOutcomeInput,
} from '@/lib/ai/cos/cognitiveVerifiedOutcome'
import { decideRevenueCosOutcome } from './cos-outcome-policy.ts'
import type { RevenueEvent } from './types.ts'

export type AuthoritativeRevenueEventResult = {
  accepted: true
  inserted: boolean
  cosAttempted: boolean
  cosStored: boolean
  cosInserted: boolean
  cosError?: string
}

type RevenueOutcomeRecorder = (
  input: CosVerifiedProductionOutcomeInput,
) => Promise<{ stored: boolean; inserted: boolean }>

function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  return String((error as { code?: unknown }).code ?? '')
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500)
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '').slice(0, 500)
  }
  return String(error ?? 'unknown_error').slice(0, 500)
}

/**
 * Append one immutable RevenueEvent to the durable ledger, then (and only then) let it feed the
 * bounded COS production-outcome learner. Duplicate event IDs are accepted idempotently and may
 * retry COS recording. COS failure never reverses or falsifies the accepted business event.
 */
export async function acceptAuthoritativeRevenueEvent(
  db: SupabaseClient,
  event: RevenueEvent,
  options: { recordOutcome?: RevenueOutcomeRecorder } = {},
): Promise<AuthoritativeRevenueEventResult> {
  const insert = await db.from('revenue_events').insert({
    event_id: event.eventId,
    schema_version: event.schemaVersion,
    tenant_id: event.tenant.tenantId,
    environment_id: event.tenant.environmentId,
    region: event.tenant.region ?? null,
    occurred_at: event.occurredAt,
    received_at: event.receivedAt,
    event_type: event.type,
    source: event.source,
    source_provider: event.sourceProvider ?? null,
    actor: event.actor ?? null,
    organization: event.organization ?? null,
    contact: event.contact ?? null,
    campaign: event.campaign ?? null,
    opportunity_id: event.opportunityId ?? null,
    pipeline_id: event.pipelineId ?? null,
    value: event.value ?? null,
    currency: event.currency ?? null,
    metadata: event.metadata,
    confidence: event.confidence,
    evidence_refs: event.evidenceRefs,
    correlation_id: event.correlationId ?? null,
    parent_event_id: event.parentEventId ?? null,
  })

  const duplicate = insert.error && errorCode(insert.error) === '23505'
  if (insert.error && !duplicate) throw insert.error

  const decision = decideRevenueCosOutcome(event)
  if (!decision.eligible) {
    return {
      accepted: true,
      inserted: !duplicate,
      cosAttempted: false,
      cosStored: false,
      cosInserted: false,
    }
  }

  const recordOutcome = options.recordOutcome ?? recordVerifiedCosProductionOutcome
  try {
    const learned = await recordOutcome({
      sourceClass: 'authoritative_record',
      sourceRef: `revenue_event:${event.eventId}`,
      domain: decision.domain,
      outcomeStatus: decision.outcomeStatus,
      summary: decision.summary,
      problemClass: decision.problemClass,
      facts: {
        eventType: event.type,
        eventSource: event.source,
        sourceProvider: event.sourceProvider ?? null,
        evidenceRefs: event.evidenceRefs,
        opportunityId: event.opportunityId ?? null,
        pipelineId: event.pipelineId ?? null,
        campaignId: event.campaign?.id ?? null,
        value: event.value ?? null,
        currency: event.currency ?? null,
        policyReason: decision.reason,
      },
      correlation: event.correlationId ? { kind: 'revenue_event_correlation', value: event.correlationId } : null,
      idempotencyKey: `revenue_event:${event.eventId}`,
      occurredAt: event.occurredAt,
    })
    return {
      accepted: true,
      inserted: !duplicate,
      cosAttempted: true,
      cosStored: learned.stored,
      cosInserted: learned.inserted,
    }
  } catch (error) {
    return {
      accepted: true,
      inserted: !duplicate,
      cosAttempted: true,
      cosStored: false,
      cosInserted: false,
      cosError: errorMessage(error),
    }
  }
}
