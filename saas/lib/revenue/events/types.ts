import type { TenantContext } from '@/lib/autonomous-systems/types'

export const REVENUE_EVENT_SCHEMA_VERSION = '1.0.0' as const

export type RevenueEventType =
  | 'lead_created'
  | 'contact_created'
  | 'prospect_enriched'
  | 'email_sent'
  | 'email_opened'
  | 'email_clicked'
  | 'reply_received'
  | 'meeting_booked'
  | 'meeting_completed'
  | 'opportunity_created'
  | 'opportunity_advanced'
  | 'opportunity_won'
  | 'opportunity_lost'
  | 'invoice_paid'
  | 'renewal_completed'

export type RevenueEventSource =
  | 'communication_hub'
  | 'crm_hub'
  | 'prospect_hub'
  | 'revenue_hub'
  | 'manual'
  | 'universal_adapter'
  | 'external_provider'

export interface RevenueActorRef {
  readonly id?: string
  readonly email?: string
  readonly name?: string
}

export interface RevenueOrganizationRef {
  readonly id?: string
  readonly name?: string
  readonly domain?: string
}

export interface RevenueContactRef {
  readonly id?: string
  readonly email?: string
  readonly name?: string
}

export interface RevenueCampaignRef {
  readonly id?: string
  readonly name?: string
}

export interface RevenueEvent {
  readonly schemaVersion: typeof REVENUE_EVENT_SCHEMA_VERSION
  readonly eventId: string
  readonly tenant: TenantContext
  readonly occurredAt: string
  readonly receivedAt: string
  readonly type: RevenueEventType
  readonly source: RevenueEventSource
  readonly sourceProvider?: string
  readonly actor?: RevenueActorRef
  readonly organization?: RevenueOrganizationRef
  readonly contact?: RevenueContactRef
  readonly campaign?: RevenueCampaignRef
  readonly opportunityId?: string
  readonly pipelineId?: string
  readonly value?: number
  readonly currency?: string
  readonly metadata: Readonly<Record<string, unknown>>
  readonly confidence: number
  readonly evidenceRefs: readonly string[]
  readonly correlationId?: string
  readonly parentEventId?: string
}

export interface RevenueEventInput extends Omit<RevenueEvent, 'schemaVersion' | 'receivedAt' | 'metadata' | 'confidence' | 'evidenceRefs'> {
  readonly receivedAt?: string
  readonly metadata?: Readonly<Record<string, unknown>>
  readonly confidence?: number
  readonly evidenceRefs?: readonly string[]
}
