// saas/lib/ai/cos/knowledgeBridge.ts
//
// KNOWLEDGE LAYER v1 — turns the reasoning core's `mustUseTool` flag into a real
// fetch from the routed source, using connectors that ALREADY exist. Where a
// source has no connector, it returns an honest "not wired" note — never a
// fabricated result. This is the bridge between "COS knows which source to
// check" and "COS actually checked it."
//
// tsconfig is non-strict: flat results; never throws to the caller.

import type { CosSourceType, CosReasoningOutput } from './reasoningTypes'
import { getBusinessMetrics, formatMetricsForAI } from '@/lib/ai/tools/getBusinessMetrics'
import { getAffiliateCount, formatAffiliatesForAI } from '@/lib/ai/tools/getAffiliateCount'
import { getExternalInfo, formatExternalInfoForAI } from '@/lib/ai/tools/getExternalInfo'
import { listRepoFiles } from '@/lib/ai/tools/repoReader'

export interface CosEvidence {
  source: CosSourceType
  connectorWired: boolean // does a connector exist for this source
  fetched: boolean        // did a real fetch succeed
  summary: string         // AI-formatted evidence, or an honest "not wired" note
  error?: string
}

function notWired(source: CosSourceType, note: string): CosEvidence {
  return { source, connectorWired: false, fetched: false, summary: note }
}

export async function gatherEvidence(source: CosSourceType, objective: string): Promise<CosEvidence> {
  try {
    switch (source) {
      case 'internal_database': {
        const r = await getBusinessMetrics()
        if (!r.ok || !r.metrics) return { source, connectorWired: true, fetched: false, summary: '', error: r.error || 'metrics fetch failed' }
        return { source, connectorWired: true, fetched: true, summary: formatMetricsForAI(r.metrics) }
      }
      case 'crm_or_leads': {
        // Existing connector covers the current partner/affiliate COUNT. Lead
        // DISCOVERY (e.g. finding new hotels) is not wired here — that path uses
        // the live public web instead.
        const r = await getAffiliateCount()
        if (!r.ok || !r.metrics) return { source, connectorWired: true, fetched: false, summary: '', error: r.error || 'affiliate fetch failed' }
        return { source, connectorWired: true, fetched: true, summary: formatAffiliatesForAI(r.metrics) }
      }
      case 'signalboost_public_website': {
        const r = await getExternalInfo(`${objective} site:signalboostapp.com`)
        if (!r.ok) return { source, connectorWired: true, fetched: false, summary: '', error: r.error }
        return { source, connectorWired: true, fetched: true, summary: formatExternalInfoForAI(objective, r.results) }
      }
      case 'live_public_website': {
        const r = await getExternalInfo(objective)
        if (!r.ok) return { source, connectorWired: true, fetched: false, summary: '', error: r.error }
        return { source, connectorWired: true, fetched: true, summary: formatExternalInfoForAI(objective, r.results) }
      }
      case 'github_repo': {
        const r = await listRepoFiles()
        if (!r.ok) return { source, connectorWired: true, fetched: false, summary: '', error: r.error || 'repo list failed' }
        const files: string[] = r.files || []
        return { source, connectorWired: true, fetched: true, summary: `Repo reachable: ${files.length} files at the queried path. Use readRepoFile for specific contents.` }
      }
      case 'analytics':
        return notWired(source, 'No analytics connector wired yet (traffic, conversion, SEO, funnels). This is the next connector to add.')
      case 'vercel_deployment':
        return notWired(source, 'No Vercel/deployment connector wired yet (deploys, build logs, env vars, DNS). This is the next connector to add.')
      case 'owner_memory':
        return notWired(source, 'Owner-memory exists in the platform (loadUserMemories) but is not bridged into the knowledge layer yet.')
      case 'no_tool_required':
      default:
        return { source, connectorWired: true, fetched: false, summary: 'No external source required for this objective.' }
    }
  } catch (e: any) {
    return { source, connectorWired: true, fetched: false, summary: '', error: e?.message || 'connector threw' }
  }
}

// Run the reasoning core's verdict through the knowledge layer: if the decision
// requires a tool, fetch the routed source; otherwise return no evidence.
export async function groundCosDecision(
  output: CosReasoningOutput,
): Promise<{ decisionId: string; evidence: CosEvidence | null }> {
  if (!output.sourceRouting.mustUseTool) {
    return { decisionId: output.decisionId, evidence: null }
  }
  const evidence = await gatherEvidence(output.sourceRouting.requiredSource, output.analysis.objective)
  return { decisionId: output.decisionId, evidence }
}
