// Server-only persistence for automatic campaign lifecycle learning.
// This module is part of the Enterprise Memory boundary; routes never touch enterprise tables.

import { getAdminSupabase } from '@/utils/supabase/server'
import {
  buildApprovedLifecyclePayload,
  buildMeasuredLifecyclePayload,
  buildPublishedLifecyclePayload,
  resolveCampaignLifecycleIdentity,
} from './lifecycleLearning'

async function upsert(campaign: any, payload: Record<string, any>) {
  const identity = resolveCampaignLifecycleIdentity(campaign)
  if (!identity) return { recorded: false as const, reason: 'missing_enterprise_identity' }
  const admin = getAdminSupabase()
  const { error } = await admin.from('enterprise_campaign_memory').upsert({
    organization_id: identity.organizationId,
    campaign_id: identity.campaignId,
    workspace: identity.workspace,
    objective: payload.objective || '',
    human_edits: payload.humanEdits || {},
    approved_version: payload.approvedVersion || null,
    channel: payload.channel || '',
    cta: payload.cta || '',
    creative: payload.creative || '',
    execution_status: payload.executionStatus || 'draft',
    performance_data: payload.performanceData || {},
  }, { onConflict: 'organization_id,campaign_id' })
  if (error) throw new Error(error.message)
  return { recorded: true as const, identity }
}

export async function recordApprovedCampaignLifecycle(campaign: any, evidence = 'campaign_lifecycle') {
  const payload = buildApprovedLifecyclePayload(campaign)
  const result = await upsert(campaign, payload)
  if (!result.recorded) return result
  const admin = getAdminSupabase()
  const { error } = await admin.from('enterprise_approval_history').insert({
    organization_id: result.identity.organizationId,
    campaign_id: result.identity.campaignId,
    decision: 'approved',
    approved_version: payload.approvedVersion,
    evidence: String(evidence).slice(0, 1000),
  })
  if (error) throw new Error(error.message)
  return result
}

export async function recordPublishedCampaignLifecycle(campaign: any, published: Record<string, unknown>) {
  return upsert(campaign, buildPublishedLifecyclePayload(campaign, published))
}

export async function recordMeasuredCampaignLifecycle(campaign: any, args: {
  performance: Record<string, unknown>
  traffic: Record<string, unknown>
  cost: unknown
  measuredAt: string
}) {
  return upsert(campaign, buildMeasuredLifecyclePayload(campaign, args))
}
