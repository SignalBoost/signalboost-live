//
// The single reader for the derived strategy profile. One reader, so a future generator and the
// owner endpoint can never disagree about what COS has learned.
//
// Reads only. It never writes a weight, never trains anything, and never calls a model.

import { getAdminSupabase } from '@/utils/supabase/server'
import { resolveCosEnterpriseMemoryScope } from '@/lib/ai/cos/cosEnterpriseMemory'
import { strategyGenerationDefaultsFromSnapshot, type StrategyGenerationDefaults } from '@/lib/ai/cos/strategyGenerationDefaults'
import {
  deriveStrategyProfile,
  type CampaignOutcomeRow,
  type StrategyProfile,
  type StrategyProfileOptions,
} from '@/lib/ai/cos/strategyProfile'

/** Deliberately generous: derivation is cheap and a truncated read would silently bias the winner. */
const CAMPAIGN_ROW_LIMIT = 2000

export type StrategyProfileGenerationView = StrategyProfile & {
  generationDefaults: StrategyGenerationDefaults
  generationRule: string
}

export type StrategyProfileReadResult =
  | { ok: true; organizationId: string; profile: StrategyProfileGenerationView }
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

  const requestedWorkspace = String(args.workspace ?? resolution.scope.workspace ?? '').trim()
  let baselineQuery = admin
    .from('enterprise_intelligence_snapshots')
    .select('snapshot,workspace,analyzed_at')
    .eq('organization_id', resolution.scope.organizationId)
    .order('analyzed_at', { ascending: false })
    .limit(1)
  if (requestedWorkspace) baselineQuery = baselineQuery.eq('workspace', requestedWorkspace)
  let baselineResult = await baselineQuery.maybeSingle()

  // A caller can omit workspace, or ask from a workspace without its own intelligence snapshot.
  // In that case use the organization's most recent baseline rather than discarding known defaults.
  if (!baselineResult.data && requestedWorkspace) {
    baselineResult = await admin
      .from('enterprise_intelligence_snapshots')
      .select('snapshot,workspace,analyzed_at')
      .eq('organization_id', resolution.scope.organizationId)
      .order('analyzed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  }

  const defaults = strategyGenerationDefaultsFromSnapshot({
    snapshot: baselineResult.data?.snapshot,
    workspace: baselineResult.data?.workspace,
    analyzedAt: baselineResult.data?.analyzed_at,
  })
  const rows = (result.data ?? []) as CampaignOutcomeRow[]
  const derived = deriveStrategyProfile(rows, args.options ?? {})

  return {
    ok: true,
    organizationId: resolution.scope.organizationId,
    profile: {
      ...derived,
      generationDefaults: defaults,
      generationRule: defaults.status === 'available'
        ? 'Overlay learned dimensions on generationDefaults. If no learned override exists, generationDefaults remain active and content generation MUST proceed; lack of measured weights is not a reason to refuse.'
        : 'If no learned override exists and no baseline snapshot is available, generate using ordinary judgement and say that no measured override was applied. Lack of measured weights alone is never a reason to refuse generation.',
    },
  }
}
