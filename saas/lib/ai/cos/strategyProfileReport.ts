//
// The single reader for the derived strategy profile. One reader, so a future generator and the
// owner endpoint can never disagree about what COS has learned.
//
// Reads only. It never writes a weight, never trains anything, and never calls a model.

import { getAdminSupabase } from '@/utils/supabase/server'
import { resolveCosEnterpriseMemoryScope } from '@/lib/ai/cos/cosEnterpriseMemory'
import {
  deriveStrategyProfile,
  type CampaignOutcomeRow,
  type StrategyProfile,
  type StrategyProfileOptions,
} from '@/lib/ai/cos/strategyProfile'

/** Deliberately generous: derivation is cheap and a truncated read would silently bias the winner. */
const CAMPAIGN_ROW_LIMIT = 2000

export type StrategyProfileReadResult =
  | { ok: true; organizationId: string; profile: StrategyProfile }
  | { ok: false; error: string; scopeStatus?: string }

export async function readStrategyProfile(args: {
  privileged: boolean
  organizationId?: unknown
  workspace?: unknown
  options?: StrategyProfileOptions
}): Promise<StrategyProfileReadResult> {
  const resolution = await resolveCosEnterpriseMemoryScope({
    privileged: args.privileged,
    requestedOrganizationId: args.organizationId,
    workspace: args.workspace,
  }).catch(() => ({ scope: null, status: 'lookup_failed' as const }))

  if (!resolution.scope) {
    return {
      ok: false,
      error: `Enterprise scope could not be resolved (${resolution.status}), so campaign outcomes cannot be read.`,
      scopeStatus: resolution.status,
    }
  }

  const admin = getAdminSupabase()
  const result = await admin
    .from('enterprise_campaign_memory')
    .select('campaign_id,channel,cta,creative,execution_status,human_edits,approved_version,performance_data,updated_at')
    .eq('organization_id', resolution.scope.organizationId)
    .order('updated_at', { ascending: false })
    .limit(CAMPAIGN_ROW_LIMIT)

  if (result.error) return { ok: false, error: `enterprise_campaign_memory read failed: ${result.error.message}` }

  const rows = (result.data ?? []) as CampaignOutcomeRow[]
  return {
    ok: true,
    organizationId: resolution.scope.organizationId,
    profile: deriveStrategyProfile(rows, args.options ?? {}),
  }
}
