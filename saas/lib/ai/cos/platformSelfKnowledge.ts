import { cosServiceDb, SupabaseKnowledgeStore } from '@/lib/cos-core/storage/supabase'
import { persistKnowledgeFactWithEmbedding } from '@/lib/ai/cos/knowledgeFactSemantic'
import type { KnowledgeFact } from '@/lib/cos-core/layers/knowledge/persistent'
import { ENTERPRISE_MEMORY_DEFINITION, SEMANTIC_ANSWER_CACHE_DEFINITION } from '@/lib/ai/cos/cosMemoryLayerDefinitions'

const SOURCE_VERSION = 'platform-self-knowledge:v2'

export type PlatformSelfKnowledgeSeedResult = {
  attempted: number
  embedded: number
  skipped: number
  failed: number
  errors: string[]
}

/**
 * Versioned, code-derived facts about SignalBoost's own COS runtime.
 *
 * These are not model-generated claims and do not depend on an external provider. Every fact points
 * back to the repository paths that implement the behavior. Keeping this set deliberately small
 * gives COS an authoritative internal source for questions about its own wake/routing governance
 * without turning ordinary source code into an unbounded retrieval corpus.
 */
export function platformSelfKnowledgeFacts(updatedAt = new Date()): KnowledgeFact[] {
  return [
    {
      id: 'cos-platform-self-knowledge-enterprise-memory-v1',
      taskId: 'support',
      subject: 'SignalBoost COS Enterprise Memory',
      predicate: 'authoritative_definition',
      object: ENTERPRISE_MEMORY_DEFINITION,
      confidence: 1,
      source: `${SOURCE_VERSION}:saas/lib/enterprise/memory/retriever.ts;saas/lib/ai/cos/cosEnterpriseMemory.ts;saas/lib/ai/cos/cosFirstAnswerEnterprise.ts`,
      updatedAt,
    },
    {
      id: 'cos-platform-self-knowledge-semantic-cache-v1',
      taskId: 'support',
      subject: 'SignalBoost COS Semantic Cache',
      predicate: 'authoritative_definition',
      object: SEMANTIC_ANSWER_CACHE_DEFINITION,
      confidence: 1,
      source: `${SOURCE_VERSION}:saas/lib/cos-core/layers/knowledge/index.ts;saas/lib/ai/cos/cosAnswerPolicy.ts;saas/lib/ai/cos/cosFirstAnswerEnterprise.ts`,
      updatedAt,
    },
    {
      id: 'cos-platform-self-knowledge-interactive-wake-v1',
      taskId: 'support',
      subject: 'SignalBoost COS RunPod wake governance',
      predicate: 'interactive_wake_authority',
      object: 'Interactive RunPod wake authority belongs to the browser COS ingress. The ingress validates a fresh same-origin user interaction before wrapping COS Primary in request-scoped wake permission; background or untrusted work does not inherit that authority.',
      confidence: 1,
      source: `${SOURCE_VERSION}:saas/app/api/cos-browser/route.ts;saas/lib/ai/local-inference.ts`,
      updatedAt,
    },
    {
      id: 'cos-platform-self-knowledge-passive-embedding-v1',
      taskId: 'support',
      subject: 'SignalBoost COS RunPod wake governance',
      predicate: 'background_embedding_lifecycle',
      object: 'Foreground semantic query embeddings are lifecycle-aware and may use governed runtime readiness. Passive/background embedding and backfill paths call the lifecycle-neutral embedding API and must not wake stopped RunPod compute merely to fill vectors.',
      confidence: 1,
      source: `${SOURCE_VERSION}:saas/lib/ai/cos/localEmbeddings.ts;saas/lib/ai/cos/knowledgeFactSemantic.ts;saas/lib/ai/cos/learnedCorpusSemantic.ts`,
      updatedAt,
    },
    {
      id: 'cos-platform-self-knowledge-fresh-routing-v1',
      taskId: 'support',
      subject: 'SignalBoost COS fresh-data routing',
      predicate: 'fresh_facts_bypass_ordinary_runpod_preflight',
      object: 'Questions requiring fresh external evidence are routed through the dedicated current-fact path before ordinary RunPod readiness or enterprise semantic retrieval. Ordinary COS local-first preflight therefore cannot become the authority for volatile current facts.',
      confidence: 1,
      source: `${SOURCE_VERSION}:saas/lib/ai/cos/cosFirstAnswer.ts;saas/app/api/cos-primary/route.ts`,
      updatedAt,
    },
    {
      id: 'cos-platform-self-knowledge-cold-retry-v1',
      taskId: 'support',
      subject: 'SignalBoost COS RunPod cold-start recovery',
      predicate: 'bounded_request_owned_retry',
      object: 'RunPod cold-start recovery uses one bounded readiness budget. A second resume attempt is permitted only when the same request started the compute on its first wake attempt; unrelated background work cannot claim that retry authority.',
      confidence: 1,
      source: `${SOURCE_VERSION}:saas/lib/ai/local-inference.ts`,
      updatedAt,
    },
  ]
}

function sameStoredFact(row: any, fact: KnowledgeFact): boolean {
  return Boolean(
    row &&
    String(row.object ?? '') === fact.object &&
    Number(row.confidence ?? 0) === fact.confidence &&
    String(row.source ?? '') === fact.source &&
    row.embedding != null,
  )
}

/**
 * Idempotently seed the small verified self-knowledge set into the semantic Knowledge Graph.
 * The caller is responsible for governed local-runtime readiness. Embedding stays local/passive;
 * this function never wakes RunPod and never invokes external AI or a prospect-data provider.
 */
export async function seedPlatformSelfKnowledge(): Promise<PlatformSelfKnowledgeSeedResult> {
  const db = cosServiceDb()
  if (!db) return { attempted: 0, embedded: 0, skipped: 0, failed: 1, errors: ['COS Supabase service store is not configured'] }

  const store = new SupabaseKnowledgeStore(db)
  const facts = platformSelfKnowledgeFacts()
  const settled = await Promise.allSettled(facts.map(async fact => {
    const existing = await db.from('cos_knowledge_facts')
      .select('object,confidence,source,embedding')
      .eq('task_id', fact.taskId)
      .eq('subject', fact.subject)
      .eq('predicate', fact.predicate)
      .maybeSingle()
    if (existing.error) throw existing.error
    if (sameStoredFact(existing.data, fact)) return 'skipped' as const

    const persisted = await persistKnowledgeFactWithEmbedding(store, fact)
    if (!persisted.embedded) throw new Error(persisted.error || `Embedding failed for ${fact.predicate}`)
    return 'embedded' as const
  }))

  const fulfilled = settled.filter((result): result is PromiseFulfilledResult<'embedded' | 'skipped'> => result.status === 'fulfilled')
  const rejected = settled.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
  return {
    attempted: facts.length,
    embedded: fulfilled.filter(result => result.value === 'embedded').length,
    skipped: fulfilled.filter(result => result.value === 'skipped').length,
    failed: rejected.length,
    errors: rejected.map(result => result.reason instanceof Error ? result.reason.message : String(result.reason)).slice(0, 8),
  }
}
