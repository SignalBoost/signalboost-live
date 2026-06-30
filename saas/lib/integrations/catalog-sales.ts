// saas/lib/integrations/catalog-sales.ts
// The future-ready sales + marketing stack, registered as plug-and-play adapters.
// Flagship providers (HubSpot, Segment, Apollo) ship REAL capability methods to prove
// the substrate end to end across categories and auth types. Every other provider is
// cataloged with its connect metadata + declared capabilities and lights up the moment
// its method is implemented — same pattern, no caller changes.
import type { IntegrationProvider, IntegrationContext, IntegrationResult } from './types'
import { registerProvider } from './registry'

const ok = (data: any, mode: string): IntegrationResult => ({ ok: true, data, mode })
const bad = (mode: string, error?: string): IntegrationResult => ({ ok: false, mode, error })

// ── CRM ────────────────────────────────────────────────────────────────────────
const hubspot: IntegrationProvider = {
  id: 'hubspot', label: 'HubSpot', category: 'crm', auth: 'oauth2',
  authUrl: 'https://app.hubspot.com/oauth/authorize', tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
  scopes: ['crm.objects.contacts.write', 'crm.objects.contacts.read', 'crm.objects.deals.write'],
  docsUrl: 'https://developers.hubspot.com/docs/api/crm/contacts',
  capabilities: ['contact_sync', 'deal_sync', 'activity_log', 'webhooks'],
  async upsertContact(ctx: IntegrationContext, c): Promise<IntegrationResult> {
    const props = { email: c.email, firstname: c.firstName || c.firstname, lastname: c.lastName || c.lastname, company: c.company, website: c.website, phone: c.phone }
    const headers = { Authorization: `Bearer ${ctx.accessToken}`, 'Content-Type': 'application/json' }
    const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', { method: 'POST', headers, body: JSON.stringify({ properties: props }) })
    if (res.status === 409 && c.email) {
      // Already exists -> update by email (idempotent upsert)
      const up = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(c.email)}?idProperty=email`, { method: 'PATCH', headers, body: JSON.stringify({ properties: props }) })
      const ud: any = await up.json().catch(() => ({}))
      if (!up.ok || !ud.id) return bad('hubspot_update_failed', ud?.message)
      return ok({ id: ud.id, updated: true }, 'hubspot_contact_upserted')
    }
    const d: any = await res.json().catch(() => ({}))
    if (!res.ok || !d.id) return bad('hubspot_create_failed', d?.message)
    return ok({ id: d.id, created: true }, 'hubspot_contact_upserted')
  },
  async logActivity(ctx: IntegrationContext, a): Promise<IntegrationResult> {
    const body = { properties: { hs_note_body: String(a.note || a.body || ''), hs_timestamp: a.timestamp || new Date().toISOString() } }
    const res = await fetch('https://api.hubapi.com/crm/v3/objects/notes', { method: 'POST', headers: { Authorization: `Bearer ${ctx.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d: any = await res.json().catch(() => ({}))
    if (!res.ok || !d.id) return bad('hubspot_note_failed', d?.message)
    return ok({ id: d.id }, 'hubspot_activity_logged')
  },
}

const salesforce: IntegrationProvider = {
  id: 'salesforce', label: 'Salesforce', category: 'crm', auth: 'oauth2',
  authUrl: 'https://login.salesforce.com/services/oauth2/authorize', tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
  scopes: ['api', 'refresh_token'], docsUrl: 'https://developer.salesforce.com/docs',
  capabilities: ['contact_sync', 'deal_sync', 'activity_log', 'webhooks'],
}

// ── Email + marketing automation ──────────────────────────────────────────────
const mailchimp: IntegrationProvider = {
  id: 'mailchimp', label: 'Mailchimp', category: 'email_marketing', auth: 'oauth2',
  authUrl: 'https://login.mailchimp.com/oauth2/authorize', tokenUrl: 'https://login.mailchimp.com/oauth2/token',
  scopes: [], docsUrl: 'https://mailchimp.com/developer/marketing/api/',
  capabilities: ['list_sync', 'campaign_create', 'automation_trigger', 'email_analytics'],
}
const sendgridMktg: IntegrationProvider = {
  id: 'sendgrid_marketing', label: 'SendGrid Marketing Campaigns', category: 'email_marketing', auth: 'api_key',
  docsUrl: 'https://docs.sendgrid.com/api-reference/marketing-campaigns',
  capabilities: ['list_sync', 'campaign_create', 'email_analytics'],
}

// ── Messaging + sales chat ────────────────────────────────────────────────────
const intercom: IntegrationProvider = {
  id: 'intercom', label: 'Intercom', category: 'messaging', auth: 'oauth2',
  authUrl: 'https://app.intercom.com/oauth', tokenUrl: 'https://api.intercom.io/auth/eagle/token',
  scopes: [], docsUrl: 'https://developers.intercom.com/',
  capabilities: ['chat_widget', 'lead_qualification', 'conversation_sync'],
}
const drift: IntegrationProvider = { id: 'drift', label: 'Drift', category: 'messaging', auth: 'oauth2', authUrl: 'https://dev.drift.com/oauth/authorize', tokenUrl: 'https://driftapi.com/oauth2/token', capabilities: ['chat_widget', 'lead_qualification', 'conversation_sync'] }
const zendesk: IntegrationProvider = { id: 'zendesk', label: 'Zendesk', category: 'messaging', auth: 'oauth2', authUrl: 'https://{subdomain}.zendesk.com/oauth/authorizations/new', capabilities: ['conversation_sync', 'lead_qualification'] }

// ── CDP ───────────────────────────────────────────────────────────────────────
const segment: IntegrationProvider = {
  id: 'segment', label: 'Segment', category: 'cdp', auth: 'api_key',
  docsUrl: 'https://segment.com/docs/connections/sources/catalog/libraries/server/http-api/',
  capabilities: ['event_track', 'identity_resolve', 'destination_sync'],
  async trackEvent(ctx: IntegrationContext, e): Promise<IntegrationResult> {
    const auth = Buffer.from(`${ctx.apiKey}:`).toString('base64')
    const body: Record<string, any> = { event: e.event, properties: e.properties || {} }
    if (e.userId) body.userId = e.userId; else body.anonymousId = e.anonymousId || 'signalboost-anon'
    const res = await fetch('https://api.segment.io/v1/track', { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) { const d: any = await res.json().catch(() => ({})); return bad('segment_track_failed', d?.error || String(res.status)) }
    return ok({ tracked: true }, 'segment_event_tracked')
  },
}
const hightouch: IntegrationProvider = { id: 'hightouch', label: 'Hightouch', category: 'cdp', auth: 'api_key', docsUrl: 'https://hightouch.com/docs/api-reference', capabilities: ['destination_sync', 'reverse_etl'] }
const rudderstack: IntegrationProvider = { id: 'rudderstack', label: 'RudderStack', category: 'cdp', auth: 'api_key', capabilities: ['event_track', 'identity_resolve', 'destination_sync'] }

// ── Prospecting + enrichment ──────────────────────────────────────────────────
const apollo: IntegrationProvider = {
  id: 'apollo', label: 'Apollo', category: 'enrichment', auth: 'api_key',
  docsUrl: 'https://docs.apollo.io/reference/people-enrichment',
  capabilities: ['lead_enrich', 'company_intel', 'contact_discovery'],
  async enrichLead(ctx: IntegrationContext, q): Promise<IntegrationResult> {
    const res = await fetch('https://api.apollo.io/v1/people/match', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': String(ctx.apiKey) }, body: JSON.stringify({ email: q.email, first_name: q.firstName, last_name: q.lastName, organization_name: q.company, domain: q.domain }) })
    const d: any = await res.json().catch(() => ({}))
    if (!res.ok || !d.person) return bad('apollo_enrich_failed', d?.error || String(res.status))
    const p = d.person
    return ok({ name: p.name, title: p.title, email: p.email, linkedin: p.linkedin_url, company: p.organization?.name }, 'apollo_lead_enriched')
  },
}
const zoominfo: IntegrationProvider = { id: 'zoominfo', label: 'ZoomInfo', category: 'enrichment', auth: 'api_key', docsUrl: 'https://api-docs.zoominfo.com/', capabilities: ['lead_enrich', 'company_intel', 'contact_discovery'] }
const clay: IntegrationProvider = { id: 'clay', label: 'Clay', category: 'enrichment', auth: 'api_key', docsUrl: 'https://www.clay.com/', capabilities: ['lead_enrich', 'contact_discovery'] }

// ── Scheduling ────────────────────────────────────────────────────────────────
const calendly: IntegrationProvider = { id: 'calendly', label: 'Calendly', category: 'scheduling', auth: 'oauth2', authUrl: 'https://auth.calendly.com/oauth/authorize', tokenUrl: 'https://auth.calendly.com/oauth/token', docsUrl: 'https://developer.calendly.com/', capabilities: ['booking_link', 'calendar_sync', 'meeting_reminder'] }
const calcom: IntegrationProvider = { id: 'calcom', label: 'Cal.com', category: 'scheduling', auth: 'api_key', docsUrl: 'https://cal.com/docs/api-reference', capabilities: ['booking_link', 'calendar_sync', 'meeting_reminder'] }

// ── Payments ──────────────────────────────────────────────────────────────────
const stripe: IntegrationProvider = { id: 'stripe', label: 'Stripe', category: 'payments', auth: 'api_key', docsUrl: 'https://stripe.com/docs/api', capabilities: ['payment_link', 'subscription', 'invoice'] }
const paddle: IntegrationProvider = { id: 'paddle', label: 'Paddle', category: 'payments', auth: 'api_key', capabilities: ['subscription', 'invoice'] }
const lemonsqueezy: IntegrationProvider = { id: 'lemonsqueezy', label: 'Lemon Squeezy', category: 'payments', auth: 'api_key', capabilities: ['payment_link', 'subscription'] }

export const SALES_CATALOG: IntegrationProvider[] = [
  hubspot, salesforce,
  mailchimp, sendgridMktg,
  intercom, drift, zendesk,
  segment, hightouch, rudderstack,
  apollo, zoominfo, clay,
  calendly, calcom,
  stripe, paddle, lemonsqueezy,
]

export function registerSalesCatalog(): void {
  for (const p of SALES_CATALOG) registerProvider(p)
}
