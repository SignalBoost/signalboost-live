// saas/lib/prospect-intelligence/memory.ts
// Prospect-specific memory service layered on top of Enterprise Memory.
// This module is additive and does not alter existing outreach execution.

import { getAdminSupabase } from '@/utils/supabase/server'

const DAY = 24 * 60 * 60 * 1000

export const PROSPECT_FRESHNESS_POLICY = {
  companyProfileMs: 180 * DAY,
  technologyProfileMs: 90 * DAY,
  buyerRoleMs: 60 * DAY,
  businessEmailMs: 30 * DAY,
  recentNewsMs: 7 * DAY,
} as const

export type ProspectFreshnessKey = keyof typeof PROSPECT_FRESHNESS_POLICY
export type ProspectVerificationStatus = 'unverified' | 'verified' | 'invalid' | 'bounced'
export type ProspectOutreachAction = 'drafted' | 'sent' | 'sent_externally' | 'replied' | 'bounced' | 'unsubscribed' | 'do_not_contact'

export type ProspectContactInput = {
  organizationId: string
  fullName?: string
  roleTitle?: string
  department?: string
  businessEmail?: string
  phone?: string
  linkedinUrl?: string
  sourceType?: string
  sourceReference?: string
  verificationStatus?: ProspectVerificationStatus
  confidence?: number
  lastVerifiedAt?: string | null
}

export type BuyerMapInput = {
  organizationId: string
  contactId?: string | null
  buyerRole: string
  priority?: number
  campaignKey?: string
  rationale?: string
  fitScore?: number
  confidence?: number
  sourceHistory?: unknown[]
  refreshedAt?: string
}

export type FreshnessInput = {
  organizationId: string
  entityType?: 'organization' | 'contact' | 'buyer_map'
  entityId?: string
  fieldKey: string
  sourceType?: string
  sourceReference?: string
  confidence?: number
  verifiedAt?: string
  expiresAt?: string | null
  metadata?: Record<string, unknown>
}

function clamp01(value: number | undefined) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, Number(value)))
}

export function expiresAtFor(key: ProspectFreshnessKey, verifiedAt = new Date()): string {
  return new Date(verifiedAt.getTime() + PROSPECT_FRESHNESS_POLICY[key]).toISOString()
}

export function isFresh(expiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return false
  const expires = new Date(expiresAt).getTime()
  return Number.isFinite(expires) && expires > now
}

export async function upsertProspectContact(input: ProspectContactInput): Promise<string> {
  const admin = getAdminSupabase()
  const email = (input.businessEmail || '').trim().toLowerCase()
  const nowIso = new Date().toISOString()
  const payload = {
    organization_id: input.organizationId,
    full_name: input.fullName || '',
    role_title: input.roleTitle || '',
    department: input.department || '',
    business_email: email,
    phone: input.phone || '',
    linkedin_url: input.linkedinUrl || '',
    source_type: input.sourceType || '',
    source_reference: input.sourceReference || '',
    verification_status: input.verificationStatus || 'unverified',
    confidence: clamp01(input.confidence),
    last_verified_at: input.lastVerifiedAt ?? null,
    updated_at: nowIso,
  }

  if (email) {
    const { data: existing } = await admin
      .from('prospect_contacts')
      .select('id')
      .eq('organization_id', input.organizationId)
      .eq('business_email', email)
      .maybeSingle()
    if (existing?.id) {
      await admin.from('prospect_contacts').update(payload).eq('id', existing.id)
      return existing.id
    }
  }

  const { data, error } = await admin.from('prospect_contacts').insert(payload).select('id').single()
  if (error || !data) throw new Error(error?.message || 'Failed to save prospect contact.')
  return data.id
}

export async function upsertBuyerMap(input: BuyerMapInput): Promise<void> {
  const admin = getAdminSupabase()
  await admin.from('prospect_buyer_map').upsert({
    organization_id: input.organizationId,
    contact_id: input.contactId ?? null,
    buyer_role: input.buyerRole.trim(),
    priority: input.priority ?? 100,
    campaign_key: input.campaignKey || '',
    rationale: input.rationale || '',
    fit_score: clamp01(input.fitScore),
    confidence: clamp01(input.confidence),
    source_history: input.sourceHistory || [],
    refreshed_at: input.refreshedAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id,campaign_key,buyer_role' })
}

export async function recordFieldFreshness(input: FreshnessInput): Promise<void> {
  const admin = getAdminSupabase()
  const verifiedAt = input.verifiedAt || new Date().toISOString()
  await admin.from('prospect_field_freshness').upsert({
    organization_id: input.organizationId,
    entity_type: input.entityType || 'organization',
    entity_id: input.entityId || '',
    field_key: input.fieldKey,
    source_type: input.sourceType || '',
    source_reference: input.sourceReference || '',
    confidence: clamp01(input.confidence),
    verified_at: verifiedAt,
    expires_at: input.expiresAt ?? null,
    status: input.expiresAt && new Date(input.expiresAt).getTime() <= Date.now() ? 'stale' : 'fresh',
    metadata: input.metadata || {},
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id,entity_type,entity_id,field_key' })
}

export async function recordProspectOutreach(args: {
  organizationId: string
  contactId?: string | null
  campaignId?: string
  action: ProspectOutreachAction
  channel?: string
  providerMessageId?: string
  details?: Record<string, unknown>
  occurredAt?: string
}): Promise<void> {
  const admin = getAdminSupabase()
  await admin.from('prospect_outreach_history').insert({
    organization_id: args.organizationId,
    contact_id: args.contactId ?? null,
    campaign_id: args.campaignId || '',
    action: args.action,
    channel: args.channel || 'email',
    provider_message_id: args.providerMessageId || '',
    details: args.details || {},
    occurred_at: args.occurredAt || new Date().toISOString(),
  })
}

export async function getProspectMemory(organizationId: string, campaignKey = '') {
  const admin = getAdminSupabase()
  const [contacts, buyers, freshness, outreach] = await Promise.all([
    admin.from('prospect_contacts').select('*').eq('organization_id', organizationId).order('confidence', { ascending: false }),
    admin.from('prospect_buyer_map').select('*').eq('organization_id', organizationId).eq('campaign_key', campaignKey).order('priority', { ascending: true }),
    admin.from('prospect_field_freshness').select('*').eq('organization_id', organizationId),
    admin.from('prospect_outreach_history').select('*').eq('organization_id', organizationId).order('occurred_at', { ascending: false }).limit(50),
  ])
  return {
    organizationId,
    contacts: contacts.data || [],
    buyers: buyers.data || [],
    freshness: freshness.data || [],
    outreach: outreach.data || [],
  }
}

export function fieldsNeedingRefresh(rows: readonly Record<string, unknown>[], now = Date.now()): string[] {
  return rows
    .filter(row => {
      if (row.status === 'invalidated' || row.status === 'failed' || row.status === 'stale') return true
      const expiresAt = typeof row.expires_at === 'string' ? row.expires_at : null
      return !isFresh(expiresAt, now)
    })
    .map(row => String(row.field_key || '').trim())
    .filter(Boolean)
}
