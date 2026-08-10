import { KnowledgeGraph } from '@/lib/cos-core/layers/knowledge/persistent.ts'
import { createSupabaseCOSStores } from '@/lib/cos-core/storage/supabase.ts'
import type { ProspectProviderContext } from '@/lib/prospect-intelligence/contracts.ts'
import { configuredCorpusProviderEnrichers } from './provider-enrichers.ts'
import { resolveBusinessIntelligence } from './orchestrator.ts'
import type { CorpusLookup } from './contracts.ts'
import { recordCorpusLookupMetric } from './metrics.ts'

export async function resolveCompanyIntelligence(args: {
  lookup: CorpusLookup
  providerContext?: Partial<ProspectProviderContext>
  allowProviderFallback?: boolean
}) {
  const startedAt = Date.now()
  const stores = createSupabaseCOSStores()
  const graph = stores?.knowledge ? new KnowledgeGraph(stores.knowledge) : undefined
  const providerFallbackPermitted = (args.allowProviderFallback ?? true)
    && process.env.PROSPECT_LIVE_PROVIDER_EXECUTION === '1'

  const result = await resolveBusinessIntelligence({
    lookup: args.lookup,
    graph,
    enrichers: providerFallbackPermitted
      ? configuredCorpusProviderEnrichers(args.providerContext)
      : [],
  })

  await recordCorpusLookupMetric({
    query: args.lookup.query,
    canonicalDomain: args.lookup.canonicalDomain || result?.record.canonicalDomain || null,
    internalHit: result?.source === 'internal',
    sufficient: Boolean(result?.record && result.record.confidence >= (args.lookup.minConfidence ?? 0.78)),
    providerCalled: Boolean(result?.providerCalled),
    providerId: result?.providerId || null,
    confidence: result?.record.confidence ?? 0,
    latencyMs: Date.now() - startedAt,
    outcome: result ? 'resolved' : 'not_found',
  }).catch(error => console.error('business intelligence corpus metric failed:', error))

  return {
    result,
    providerFallbackPermitted,
    providerFallbackUsed: Boolean(result?.providerCalled),
  }
}
