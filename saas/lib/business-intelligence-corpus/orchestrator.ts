import type { KnowledgeGraph } from '@/lib/cos-core/layers/knowledge/persistent.ts'
import {
  CORPUS_DEFAULT_MIN_CONFIDENCE,
  type BusinessIntelligenceRecord,
  type CorpusEnrichmentResult,
  type CorpusLookup,
} from './contracts.ts'
import { lookupCorpus, queueCorpusRefresh, upsertCorpusRecord } from './service.ts'
import { persistCorpusIntelligence } from './integration.ts'

export type CorpusProviderEnricher = (input: CorpusLookup) => Promise<{
  providerId: string
  record: BusinessIntelligenceRecord | null
}>

export async function resolveBusinessIntelligence(args: {
  lookup: CorpusLookup
  enrichers?: readonly CorpusProviderEnricher[]
  graph?: KnowledgeGraph
}): Promise<CorpusEnrichmentResult | null> {
  const minConfidence = args.lookup.minConfidence ?? CORPUS_DEFAULT_MIN_CONFIDENCE
  const internal = await lookupCorpus({ ...args.lookup, minConfidence })

  if (internal.sufficient && internal.record) {
    return { record: internal.record, source: 'internal', providerCalled: false }
  }

  if (internal.record) {
    await queueCorpusRefresh({
      canonicalDomain: internal.record.canonicalDomain,
      corpusId: internal.record.id,
      reason: internal.reason,
      priority: internal.reason === 'low_confidence' ? 90 : 70,
    })
  }

  for (const enricher of args.enrichers ?? []) {
    const enriched = await enricher(args.lookup)
    if (!enriched.record) continue
    if (enriched.record.confidence < minConfidence) continue

    const saved = await upsertCorpusRecord({
      ...enriched.record,
      sourceType: 'provider',
      sourceIds: [...new Set([...enriched.record.sourceIds, enriched.providerId])],
    })
    await persistCorpusIntelligence({ record: saved, graph: args.graph })
    return { record: saved, source: 'provider', providerCalled: true, providerId: enriched.providerId }
  }

  return internal.record
    ? { record: internal.record, source: 'internal', providerCalled: false }
    : null
}
