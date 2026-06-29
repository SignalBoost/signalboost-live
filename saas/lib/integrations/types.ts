// saas/lib/integrations/types.ts
// The plug-and-play substrate for the sales + marketing stack. Every provider —
// CRM, email/marketing, messaging, CDP, enrichment, scheduling, payments — is a
// uniform adapter. Adding a provider = register one adapter; the connect flow,
// capability dispatch, and per-tenant credentials are all generic. This is the
// Vercel/Supabase/Stripe-style layer for sales infrastructure.

export type IntegrationCategory =
  | 'crm' | 'email_marketing' | 'messaging' | 'cdp' | 'enrichment' | 'scheduling' | 'payments'

export type AuthKind = 'oauth2' | 'api_key'

// The capability vocabulary. A provider DECLARES which it supports; it IMPLEMENTS the
// ones whose method is present. Declared-but-unimplemented = honest "not wired yet".
export type Capability =
  | 'contact_sync' | 'deal_sync' | 'activity_log' | 'webhooks'
  | 'list_sync' | 'campaign_create' | 'automation_trigger' | 'email_analytics'
  | 'chat_widget' | 'lead_qualification' | 'conversation_sync'
  | 'event_track' | 'identity_resolve' | 'destination_sync' | 'reverse_etl'
  | 'lead_enrich' | 'company_intel' | 'contact_discovery'
  | 'booking_link' | 'calendar_sync' | 'meeting_reminder'
  | 'payment_link' | 'subscription' | 'invoice'

// Per-tenant connection material, resolved from integration_connections by org.
export interface IntegrationContext {
  orgId: string
  accessToken?: string
  refreshToken?: string
  apiKey?: string
  accountRef?: string
  metadata?: Record<string, any>
}

export interface IntegrationResult<T = any> { ok: boolean; data?: T; error?: string; mode?: string }

// Capability method signatures are optional. Presence = real implementation.
export interface IntegrationProvider {
  id: string
  label: string
  category: IntegrationCategory
  auth: AuthKind
  authUrl?: string
  tokenUrl?: string
  scopes?: string[]
  docsUrl?: string
  capabilities: Capability[]

  // CRM
  upsertContact?: (ctx: IntegrationContext, contact: Record<string, any>) => Promise<IntegrationResult>
  upsertDeal?: (ctx: IntegrationContext, deal: Record<string, any>) => Promise<IntegrationResult>
  logActivity?: (ctx: IntegrationContext, activity: Record<string, any>) => Promise<IntegrationResult>
  // Email / marketing
  addToList?: (ctx: IntegrationContext, args: Record<string, any>) => Promise<IntegrationResult>
  createCampaign?: (ctx: IntegrationContext, args: Record<string, any>) => Promise<IntegrationResult>
  // Messaging
  syncConversation?: (ctx: IntegrationContext, args: Record<string, any>) => Promise<IntegrationResult>
  // CDP
  trackEvent?: (ctx: IntegrationContext, args: Record<string, any>) => Promise<IntegrationResult>
  // Enrichment
  enrichLead?: (ctx: IntegrationContext, query: Record<string, any>) => Promise<IntegrationResult>
  // Scheduling
  bookingLink?: (ctx: IntegrationContext, args: Record<string, any>) => Promise<IntegrationResult>
  // Payments
  paymentLink?: (ctx: IntegrationContext, args: Record<string, any>) => Promise<IntegrationResult>
}

// The capability -> adapter-method map, so dispatch is uniform and extensible.
export const CAPABILITY_METHOD: Partial<Record<Capability, keyof IntegrationProvider>> = {
  contact_sync: 'upsertContact',
  deal_sync: 'upsertDeal',
  activity_log: 'logActivity',
  list_sync: 'addToList',
  campaign_create: 'createCampaign',
  conversation_sync: 'syncConversation',
  event_track: 'trackEvent',
  lead_enrich: 'enrichLead',
  booking_link: 'bookingLink',
  payment_link: 'paymentLink',
}
