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

function activeBaselineSummary(defaults: StrategyGenerationDefaults): string {
  if (defaults.status !== 'available') return 'No Enterprise Intelligence baseline is currently available.'
  return [
    `goal=${defaults.goal || 'unspecified'}`,
    `tone=${defaults.tone || 'unspecified'}`,
    `format=${defaults.format || 'unspecified'}`,
    `offer=${defaults.offerType || 'unspecified'}`,
    `cta=${defaults.ctaStrategy || 'unspecified'}`,
    defaults.description ? `subject=${defaults.description}` : '',
  ].filter(Boolean).join('; ')
}

function safeEvidenceSummary(profile: StrategyProfile): string {
  if (profile.measuredCampaigns !== 0) return profile.summary
  return `NO MEASURED OUTCOMES — ${profile.totalCampaigns} campaign rows exist and 0 currently carry usable measured performance. No learned campaign dimension can change behavior yet, so the current baseline defaults remain active.`
}

export function strategyGenerationRule(defaults: StrategyGenerationDefaults): string {
  if (defaults.status !== 'available') {
    return 'If no learned override exists and no baseline snapshot is available, still generate the requested artifact using ordinary judgement and say that no measured override was applied. Lack of measured weights alone is never a reason to refuse generation. Do not substitute a measurement plan, pilot-campaign checklist, or placeholder for the requested artifact.'
  }

  const subject = defaults.description || 'the organization/product described by Enterprise Memory'
  return [
    'CURRENT ACTIVE STRATEGY CONTRACT:',
    `Start from the Enterprise Intelligence baseline and overlay only dimensions whose measured profile status is learned. Baseline: ${activeBaselineSummary(defaults)}.`,
    `If the user supplies no content topic, use this organization/product context as the subject: ${subject}.`,
    `Produce the actual requested artifact in the baseline format (${defaults.format || 'the configured format'}) and tone (${defaults.tone || 'the configured tone'}), pursuing the baseline goal (${defaults.goal || 'the configured goal'}), offer (${defaults.offerType || 'the configured offer'}), and CTA (${defaults.ctaStrategy || 'the configured CTA'}).`,
    'Do NOT replace the artifact with a strategy placeholder, campaign setup plan, pilot-campaign recommendations, KPI/tracking checklist, or measurement-delay discussion merely because measured campaigns are zero.',
    'Do NOT mention internal variables such as COS_MEASURE_DELAY_HOURS unless they are explicitly present in the current evidence and directly requested by the user.',
    'After the artifact, explain which learned heuristics changed the baseline. If there are no learned overrides, say so plainly and identify the baseline defaults that were used; do not call baseline defaults learned weights or learned heuristics.',
  ].join(' ')
}

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
  const evidenceSummary = safeEvidenceSummary(derived)
  const fallbackSummary = derived.changesBehavior
    ? evidenceSummary
    : `${evidenceSummary} GENERATION FALLBACK — no learned override means keep the current baseline defaults and generate the requested content; it does NOT mean refuse generation. ACTIVE BASELINE — ${activeBaselineSummary(defaults)}.`

  return {
    ok: true,
    organizationId: resolution.scope.organizationId,
    profile: {
      ...derived,
      summary: fallbackSummary,
      generationDefaults: defaults,
      generationRule: strategyGenerationRule(defaults),
    },
  }
}