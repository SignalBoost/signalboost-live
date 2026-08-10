import type { KnowledgeGraph } from '@/lib/cos-core/layers/knowledge/persistent'

export const BUSINESS_INTELLIGENCE_CORPUS_TASK_ID = 'business-intelligence-corpus'

export type CorpusGraphCompany = Readonly<{
  canonicalDomain: string
  name: string
  country?: string
  industry?: string
  website?: string
  confidence: number
  source: string
  verifiedAt: string
}>

export async function rememberCorpusCompany(graph: KnowledgeGraph, company: CorpusGraphCompany) {
  const subject = company.canonicalDomain.trim().toLowerCase()
  const updatedAt = new Date(company.verifiedAt)
  const facts: Array<[string, string]> = [
    ['name', company.name],
    ['country', company.country || ''],
    ['industry', company.industry || ''],
    ['website', company.website || ''],
    ['confidence', String(company.confidence)],
  ]

  for (const [predicate, object] of facts) {
    if (!object) continue
    await graph.remember({
      id: `bic:${subject}:${predicate}`,
      taskId: BUSINESS_INTELLIGENCE_CORPUS_TASK_ID,
      subject,
      predicate,
      object,
      confidence: company.confidence,
      source: company.source,
      updatedAt,
    })
  }
}
