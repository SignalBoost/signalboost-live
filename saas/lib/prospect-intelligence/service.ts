// Shared Prospect Memory Service.
// One boundary for COS and future portables to query fast prospects, inspect durable
// Enterprise Memory, decide what is stale, and record usage without calling providers.

import { getAdminSupabase } from '@/utils/supabase/server'
import { getOrganizationMemory } from '@/lib/enterprise/memory/service'
import {
  fieldsNeedingRefresh,
  getProspectMemory,
  recordProspectOutreach,
  type ProspectOutreachAction,
} from './memory'

export type ProspectSearchFilters = {
  country?: string
  industry?: string
  campaignKey?: string
  minimumHotScore?: number
  limit?: number
  requireVerifiedEmail?: boolean
}

export type ProspectSearchResult = {
  organizationId: string
  canonicalDomain: string
  name: string
  industry: string
  profile: Record<string, unknown>
  hotScore: number
  technicalFit: number
  revenuePotential: number
  engagementPriority: number
  dataCompleteness: number
  contacts: unknown[]
  buyers: unknown[]
  staleFields: string[]
  source: 'hot_pool'
}

function clampLimit(value: number | undefined) {
  const numeric = Number(value ?? 25)
  if (!Number.isFinite(numeric)) return 25
  return Math.max(1, Math.min(250, Math.trunc(numeric)))
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function number(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function profileCountry(profile: Record<string, unknown>) {
  return text(profile.country || profile.countryCode || profile.region)
}

export async function searchHotProspects(filters: ProspectSearchFilters = {}): Promise<ProspectSearchResult[]> {
  const admin = getAdminSupabase()
  let query = admin
    .from('prospect_hot_pool')
    .select('organization_id,technical_fit,revenue_potential,engagement_priority,data_completeness,hot_score,status,campaign_keys')
    .eq('status', 'ready')
    .gte('hot_score', filters.minimumHotScore ?? 0)
    .order('hot_score', { ascending: false })
    .limit(clampLimit(filters.limit))

  if (filters.campaignKey) query = query.contains('campaign_keys', [filters.campaignKey])

  const { data: hotRows, error } = await query
  if (error) throw new Error(error.message)
  if (!hotRows?.length) return []

  const results: ProspectSearchResult[] = []
  for (const hot of hotRows) {
    const organization = await getOrganizationMemory(hot.organization_id)
    if (!organization) continue
    const profile = organization.profile || {}
    if (filters.country && profileCountry(profile).toLowerCase() !== filters.country.trim().toLowerCase()) continue
    if (filters.industry && !organization.industry.toLowerCase().includes(filters.industry.trim().toLowerCase())) continue

    const memory = await getProspectMemory(organization.id, filters.campaignKey || '')
    const contacts = Array.isArray(memory.contacts) ? memory.contacts : []
    if (filters.requireVerifiedEmail) {
      const hasVerifiedEmail = contacts.some((contact: any) =>
        text(contact.business_email) && contact.verification_status === 'verified',
      )
      if (!hasVerifiedEmail) continue
    }

    results.push({
      organizationId: organization.id,
      canonicalDomain: organization.canonicalDomain,
      name: organization.name,
      industry: organization.industry,
      profile,
      hotScore: number(hot.hot_score),
      technicalFit: number(hot.technical_fit),
      revenuePotential: number(hot.revenue_potential),
      engagementPriority: number(hot.engagement_priority),
      dataCompleteness: number(hot.data_completeness),
      contacts,
      buyers: Array.isArray(memory.buyers) ? memory.buyers : [],
      staleFields: fieldsNeedingRefresh(Array.isArray(memory.freshness) ? memory.freshness : []),
      source: 'hot_pool',
    })
  }

  return results
}

export async function promoteToHotPool(args: {
  organizationId: string
  technicalFit?: number
  revenuePotential?: number
  engagementPriority?: number
  dataCompleteness?: number
  campaignKeys?: string[]
}): Promise<void> {
  const admin = getAdminSupabase()
  const now = new Date().toISOString()
  const normalized = (value: number | undefined) => Math.max(0, Math.min(100, Number(value) || 0))
  const { error } = await admin.from('prospect_hot_pool').upsert({
    organization_id: args.organizationId,
    technical_fit: normalized(args.technicalFit),
    revenue_potential: normalized(args.revenuePotential),
    engagement_priority: normalized(args.engagementPriority),
    data_completeness: normalized(args.dataCompleteness),
    campaign_keys: [...new Set((args.campaignKeys || []).map(value => value.trim()).filter(Boolean))],
    status: 'ready',
    updated_at: now,
  }, { onConflict: 'organization_id' })
  if (error) throw new Error(error.message)
}

export async function markProspectUsed(organizationId: string): Promise<void> {
  const admin = getAdminSupabase()
  const { error } = await admin
    .from('prospect_hot_pool')
    .update({ last_used_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
  if (error) throw new Error(error.message)
}

export async function recordOutreach(args: {
  organizationId: string
  contactId?: string | null
  campaignId?: string
  action: ProspectOutreachAction
  channel?: string
  providerMessageId?: string
  details?: Record<string, unknown>
}): Promise<void> {
  await recordProspectOutreach(args)
  if (args.action === 'sent' || args.action === 'sent_externally' || args.action === 'replied') {
    await markProspectUsed(args.organizationId)
  }
}

export async function getProspectRefreshPlan(organizationId: string) {
  const memory = await getProspectMemory(organizationId)
  return {
    organizationId,
    staleFields: fieldsNeedingRefresh(Array.isArray(memory.freshness) ? memory.freshness : []),
    contacts: memory.contacts,
    buyers: memory.buyers,
    recentOutreach: memory.outreach,
  }
}
