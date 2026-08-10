import type { KnowledgeGraph } from '@/lib/cos-core/layers/knowledge/persistent'
import { mergeIntelligence, resolveOrganization } from '@/lib/enterprise/memory/service'
import { rememberCorpusCompany } from './corpus-graph'
import { evaluateCorpusEvidence, type CorpusEvidence } from './corpus-policy'
import { corpusAvoidanceEvent } from './corpus-telemetry'

export type CorpusCompanyRecord = Readonly<{
  website: string
  name: string
  country?: string
  industry?: string
  profile?: Record<string, unknown>
  confidence: number
  completeness?: number
  source: 'curated_file' | 'enterprise_memory' | 'knowledge_graph' | 'external_provider'
  verifiedAt: string
}>

export type CorpusEnrichment = (record: CorpusCompanyRecord) => Promise<CorpusCompanyRecord | null>

function domainOf(website: string) {
  try { return new URL(website).hostname.replace(/^www\./i, '').toLowerCase() }
  catch { return website.trim().toLowerCase().replace(/^www\./i, '') }
}

function evidenceOf(record: CorpusCompanyRecord): CorpusEvidence {
  return {
    source: record.source,
    confidence: record.confidence,
    completeness: record.completeness,
    verifiedAt: record.verifiedAt,
  }
}

async function persist(record: CorpusCompanyRecord, graph?: KnowledgeGraph) {
  const resolved = await resolveOrganization(record.website, record.source)
  const confidence = Math.max(0, Math.min(1, Number(record.confidence) || 0))
  await mergeIntelligence({
    organizationId: resolved.organization.id,
    workspace: 'business-intelligence-corpus',
    snapshot: {
      name: record.name,
      country: record.country || '',
      industry: record.industry || '',
      website: record.website,
      profile: record.profile || {},
      source: record.source,
      verifiedAt: record.verifiedAt,
    },
    confidence: { corpus: confidence },
    organizationPatch: {
      name: record.name,
      industry: record.industry,
      profile: { ...(resolved.organization.profile || {}), ...(record.profile || {}), country: record.country || '' },
      confidence,
    },
  })

  if (graph) {
    await rememberCorpusCompany(graph, {
      canonicalDomain: domainOf(record.website),
      name: record.name,
      country: record.country,
      industry: record.industry,
      website: record.website,
      confidence,
      source: record.source,
      verifiedAt: record.verifiedAt,
    })
  }
  return resolved.organization.id
}

export async function ingestBusinessIntelligenceRecord(args: {
  record: CorpusCompanyRecord
  graph?: KnowledgeGraph
  enrich?: CorpusEnrichment
  confidenceThreshold?: number
  maxAgeDays?: number
  providerCostPerCallUsd?: number
  aiCostPerCallUsd?: number
}) {
  const initialDecision = evaluateCorpusEvidence([evidenceOf(args.record)], {
    confidenceThreshold: args.confidenceThreshold,
    maxAgeDays: args.maxAgeDays,
  })
  const organizationId = await persist(args.record, args.graph)

  if (!initialDecision.enrichExternally || !args.enrich) {
    return {
      organizationId,
      record: args.record,
      decision: initialDecision,
      enrichmentAttempted: false,
      avoidance: corpusAvoidanceEvent({
        resolvedInternally: !initialDecision.enrichExternally,
        plannedProviderCalls: 1,
        plannedAiCalls: 1,
        providerCostPerCallUsd: args.providerCostPerCallUsd,
        aiCostPerCallUsd: args.aiCostPerCallUsd,
      }),
    }
  }

  const enriched = await args.enrich(args.record)
  if (!enriched) {
    return {
      organizationId,
      record: args.record,
      decision: initialDecision,
      enrichmentAttempted: true,
      avoidance: corpusAvoidanceEvent({ resolvedInternally: false }),
    }
  }

  const enrichedOrganizationId = await persist(enriched, args.graph)
  const finalDecision = evaluateCorpusEvidence([evidenceOf(enriched)], {
    confidenceThreshold: args.confidenceThreshold,
    maxAgeDays: args.maxAgeDays,
  })
  return {
    organizationId: enrichedOrganizationId,
    record: enriched,
    decision: finalDecision,
    enrichmentAttempted: true,
    avoidance: corpusAvoidanceEvent({ resolvedInternally: false }),
  }
}
