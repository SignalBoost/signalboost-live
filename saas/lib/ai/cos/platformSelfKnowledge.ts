// saas/lib/ai/cos/platformSelfKnowledge.ts
import { cosServiceDb, SupabaseKnowledgeStore } from '@/lib/cos-core/storage/supabase'
import { persistKnowledgeFactWithEmbedding } from '@/lib/ai/cos/knowledgeFactSemantic'
import type { KnowledgeFact } from '@/lib/cos-core/layers/knowledge/persistent'
import { ENTERPRISE_MEMORY_DEFINITION, SEMANTIC_ANSWER_CACHE_DEFINITION } from '@/lib/ai/cos/cosMemoryLayerDefinitions'

const SOURCE_VERSION = 'platform-self-knowledge:v3'

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
 *
 * v3 adds five facts closing a gap found via the private capability benchmark: COS answered
 * architecture questions correctly in substance but did not reliably use SignalBoost's own
 * terminology (fail-closed, probationary/corroboration, execution provenance, tenant isolation).
 * Each new fact is grounded in the cited source files, not invented.
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
    {
      id: 'cos-platform-self-knowledge-fail-closed-authorization-v1',
      taskId: 'support',
      subject: 'SignalBoost COS authorization and escalation policy',
      predicate: 'fail_closed_approval_boundary',
      object: 'COS fails closed whenever local resolution or authorization is insufficient rather than guessing: server-to-server callers fail closed, and enterprise sessions fail closed when tenant membership cannot be verified. Escalation to an external model is a deliberate secondary path, never the default. Any action with a real-world effect requires an approval recorded from a person; COS does not manufacture its own permission.',
      confidence: 1,
      source: `${SOURCE_VERSION}:saas/lib/ai/cos/cosFirstAnswer.ts;saas/lib/ai/cos/cosEnterpriseMemory.ts;saas/lib/ai/cos/connectorDelegation.ts`,
      updatedAt,
    },
    {
      id: 'cos-platform-self-knowledge-admission-confidence-v1',
      taskId: 'support',
      subject: 'SignalBoost COS knowledge admission',
      predicate: 'confidence_relevance_durability_gate',
      object: 'Newly acquired material is treated as durable knowledge only once it clears a high-confidence admission floor. Confidence combines source evidence quality with a relevance score measuring how well the acquired text matches the original knowledge gap. Material that does not clear the durable floor is never silently discarded; it is retained at a lower tier pending further evidence rather than treated as settled fact.',
      confidence: 1,
      source: `${SOURCE_VERSION}:saas/lib/cos-core/layers/learning/cycle.ts;saas/lib/ai/cos/tieredLearningAdmission.ts`,
      updatedAt,
    },
    {
      id: 'cos-platform-self-knowledge-tiered-admission-v1',
      taskId: 'support',
      subject: 'SignalBoost COS tiered learning admission',
      predicate: 'probationary_corroboration_promotion',
      object: 'Candidates that clear only the lower metadata confidence band are not admitted as durable knowledge outright. They are stored in a probationary tier and require independent corroboration — a second qualifying observation on the same subject — before an automated promotion pass moves them into durable knowledge. A single uncorroborated probationary candidate never becomes a fact COS treats as settled.',
      confidence: 1,
      source: `${SOURCE_VERSION}:saas/lib/ai/cos/tieredLearningAdmission.ts;saas/lib/cos-core/layers/learning/cycle.ts;saas/lib/ai/cos/cognitiveProbationaryPromotion.ts`,
      updatedAt,
    },
    {
      id: 'cos-platform-self-knowledge-execution-provenance-v1',
      taskId: 'support',
      subject: 'SignalBoost COS execution provenance',
      predicate: 'model_source_cache_disclosure',
      object: 'Every governed text call carries its own provenance: which provider and model produced the reply, and whether the response came from the durable text cache or a fresh provider call, recorded as its source. This provenance is never inferred after the fact — it is captured at the moment of the call, so a stored answer can always be traced back to its originating model, its cache status, and its source.',
      confidence: 1,
      source: `${SOURCE_VERSION}:saas/lib/cos/textGateway.ts;saas/lib/ai/cos/cosExecutionProvenance.ts`,
      updatedAt,
    },
    {
      id: 'cos-platform-self-knowledge-tenant-isolation-v1',
      taskId: 'support',
      subject: 'SignalBoost COS Enterprise Memory tenant isolation',
      predicate: 'organization_scoped_isolation',
      object: "Enterprise Memory and Semantic Cache are architecturally distinct, and both are subject to tenant isolation: every Enterprise Memory retrieval is scoped to a verified organization_id, and there is no production tenant-membership table linking an ordinary authenticated user across organizations, so cross-tenant reads fail closed rather than leaking another tenant's data. Semantic Cache entries carry the same isolation rule — an organization- or user-scoped cache entry must never be reused across tenants.",
      confidence: 1,
      source: `${SOURCE_VERSION}:saas/lib/enterprise/memory/retriever.ts;saas/lib/ai/cos/cosEnterpriseMemory.ts;saas/lib/ai/cos/cosMemoryLayerDefinitions.ts`,
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
