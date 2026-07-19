import { getAdminSupabase } from '../../../utils/supabase/server.ts'

export type CampaignMemoryRow = {
  campaign_id?: string
  workspace?: string
  objective?: string
  selected_audience?: string
  selected_product?: string
  channel?: string
  cta?: string
  creative?: string
  approval_decision?: string
  execution_status?: string
  approved_at?: string | null
  updated_at?: string | null
}

export type CampaignReuseInsight = {
  campaignId: string
  workspace: string
  objective: string
  audience: string
  product: string
  channel: string
  cta: string
  creative: string
  approvedAt: string | null
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function time(value: unknown): number {
  const parsed = Date.parse(clean(value))
  return Number.isFinite(parsed) ? parsed : 0
}

export function selectApprovedCampaignReuse(
  rows: readonly CampaignMemoryRow[],
  workspace: string,
  limit = 3,
): CampaignReuseInsight[] {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
    throw new Error('Campaign reuse limit must be an integer from 1 to 20.')
  }

  return rows
    .filter(row => clean(row.approval_decision) === 'approved')
    .filter(row => !clean(row.workspace) || clean(row.workspace) === workspace)
    .filter(row => clean(row.cta) || clean(row.creative))
    .sort((a, b) => time(b.approved_at || b.updated_at) - time(a.approved_at || a.updated_at))
    .slice(0, limit)
    .map(row => ({
      campaignId: clean(row.campaign_id),
      workspace: clean(row.workspace),
      objective: clean(row.objective),
      audience: clean(row.selected_audience),
      product: clean(row.selected_product),
      channel: clean(row.channel),
      cta: clean(row.cta),
      creative: clean(row.creative),
      approvedAt: clean(row.approved_at) || null,
    }))
}

export async function getApprovedCampaignReuse(
  organizationId: string,
  workspace: string,
  limit = 3,
): Promise<CampaignReuseInsight[]> {
  if (!organizationId.trim()) return []
  const admin = getAdminSupabase()
  const { data, error } = await admin
    .from('enterprise_campaign_memory')
    .select('campaign_id,workspace,objective,selected_audience,selected_product,channel,cta,creative,approval_decision,execution_status,approved_at,updated_at')
    .eq('organization_id', organizationId)
    .eq('approval_decision', 'approved')
    .order('approved_at', { ascending: false, nullsFirst: false })
    .limit(Math.min(20, Math.max(limit * 3, limit)))

  if (error || !Array.isArray(data)) return []
  return selectApprovedCampaignReuse(data, workspace, limit)
}
