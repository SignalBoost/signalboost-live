import { mergeIntelligence, resolveOrganization } from '@/lib/enterprise/memory/service.ts'
import type { KnowledgeGraph } from '@/lib/cos-core/layers/knowledge/persistent.ts'
import type { BusinessIntelligenceRecord } from './contracts.ts'

const FALLBACK_PROFILE_KEY = 'businessIntelligenceCorpus'

export async function persistCorpusIntelligence(args: {
  record: BusinessIntelligenceRecord
  graph?: KnowledgeGraph
}): Promise<void> {
  const { record, graph } = args
  const sourceUrl = record.website || `https://${record.canonicalDomain}`
  const { organization } = await resolveOrganization(sourceUrl, 'business_intelligence_corpus')

  const snapshot = {
    canonicalDomain: record.canonicalDomain,
    companyName: record.companyName,
    aliases: record.aliases,
    industry: record.industry || null,
    country: record.country || null,
    region: record.region || null,
    employeeCount: record.employeeCount ?? null,
    revenueUsd: record.revenueUsd ?? null,
    website: record.website || null,
    description: record.description || null,
    technologies: record.technologies || [],
    contacts: record.contacts || [],
    attributes: record.attributes,
    confidence: record.confidence,
    sourceType: record.sourceType,
    sourceIds: record.sourceIds,
    verifiedAt: record.verifiedAt,
    refreshedAt: record.refreshedAt,
    expiresAt: record.expiresAt,
  }

  // Enterprise Memory's mergeIntelligence() replaces organization.profile when a
  // profile patch is supplied. Preserve all existing profile namespaces and keep
  // the corpus record under its dedicated key so future internal-first lookups
  // continue to find it after enrichment/learning writes.
  const profile = {
    ...(organization.profile || {}),
    [FALLBACK_PROFILE_KEY]: snapshot,
  }

  await mergeIntelligence({
    organizationId: organization.id,
    workspace: 'business_intelligence_corpus',
    snapshot,
    confidence: {
      overall: record.confidence,
      profile: record.confidence,
      freshness: Date.parse(record.expiresAt) > Date.now() ? 1 : 0,
    },
    organizationPatch: {
      name: record.companyName,
      industry: record.industry,
      profile,
      confidence: record.confidence,
      aliases: [...record.aliases],
    },
    expiresAt: record.expiresAt,
  })

  if (!graph) return
  const subject = `company:${record.canonicalDomain}`
  const now = new Date(record.refreshedAt)
  const facts: Array<[string, string]> = [
    ['name', record.companyName],
    ['domain', record.canonicalDomain],
    ['industry', record.industry || ''],
    ['country', record.country || ''],
    ['region', record.region || ''],
    ['employee_count', record.employeeCount == null ? '' : String(record.employeeCount)],
    ['revenue_usd', record.revenueUsd == null ? '' : String(record.revenueUsd)],
  ]
  for (const [predicate, object] of facts) {
    if (!object) continue
    await graph.remember({
      id: `bic:${record.canonicalDomain}:${predicate}`,
      taskId: 'business_intelligence_corpus',
      subject,
      predicate,
      object,
      confidence: record.confidence,
      source: record.sourceIds.join(',') || record.sourceType,
      updatedAt: now,
    })
  }
}
