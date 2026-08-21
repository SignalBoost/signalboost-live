import { generatePassiveLocalEmbedding } from '@/lib/ai/cos/localEmbeddings'
import { embeddingModelName } from '@/lib/ai/cos/embeddingEndpoint'
import { cosServiceDb, SupabaseKnowledgeStore } from '@/lib/cos-core/storage/supabase'
import type { KnowledgeFact, PersistentKnowledgeStore } from '@/lib/cos-core/layers/knowledge/persistent'
import { resolveFactContradiction, recordFactRevision } from '@/lib/ai/cos/cognitiveFactConsolidation'

export type KnowledgeFactEmbeddingResult = {
  embedded: boolean
  error?: string
}

export type KnowledgeFactBackfillResult = {
  status: 'backfilled' | 'skipped' | 'error'
  attempted: number
  embedded: number
  failed: number
  remaining: number | null
  model?: string
  error?: string
}

export function knowledgeFactEmbeddingText(fact: Pick<KnowledgeFact, 'subject' | 'predicate' | 'object'>): string {
  return `${fact.subject}\n${fact.predicate}\n${fact.object}`
}

async function reconcileFactForPersistence(store: PersistentKnowledgeStore, fact: KnowledgeFact): Promise<KnowledgeFact> {
  const existing = await store.getFact(fact.taskId, fact.subject, fact.predicate)
  const decision = resolveFactContradiction(existing, fact)
  const reconciled: KnowledgeFact = decision.winner === 'existing'
    ? { ...fact, object: existing!.object, confidence: decision.persistedConfidence }
    : { ...fact, confidence: decision.persistedConfidence }

  if (decision.isContradiction) {
    const db = cosServiceDb()
    if (db) {
      await recordFactRevision(db, {
        taskId: fact.taskId, subject: fact.subject, predicate: fact.predicate,
        revisionKind: 'contradiction',
        previousObject: existing!.object, previousConfidence: existing!.confidence,
        newObject: reconciled.object, newConfidence: reconciled.confidence,
        reason: decision.winner === 'incoming'
          ? 'incoming claim had equal or higher confidence than the existing fact'
          : 'existing claim had higher confidence; incoming claim distrusted, not discarded',
      })
    }
  }
  return reconciled
}

export async function persistKnowledgeFactWithEmbedding(
  store: PersistentKnowledgeStore,
  fact: KnowledgeFact,
): Promise<KnowledgeFactEmbeddingResult> {
  const reconciled = await reconcileFactForPersistence(store, fact)
  try {
    const embedding = await generatePassiveLocalEmbedding(knowledgeFactEmbeddingText(reconciled))
    // SupabaseKnowledgeStore stamps the active embedding model whenever a vector is supplied.
    await store.upsertFact(reconciled, embedding)
    return { embedded: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('cosKnowledgeFact: semantic embedding unavailable; storing fact without vector', {
      factId: reconciled.id,
      error: message,
    })
    await store.upsertFact(reconciled)
    return { embedded: false, error: message }
  }
}

function rowToFact(row: any): KnowledgeFact {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    subject: String(row.subject ?? ''),
    predicate: String(row.predicate ?? ''),
    object: String(row.object ?? ''),
    confidence: Number(row.confidence ?? 0),
    source: String(row.source ?? ''),
    updatedAt: new Date(row.updated_at),
  }
}

const FACT_SELECT = 'id,task_id,subject,predicate,object,confidence,source,updated_at,embedding_model'

async function factEmbeddingBacklogCount(model: string): Promise<number | null> {
  const db = cosServiceDb()
  if (!db) return null
  const [missing, stale] = await Promise.all([
    db.from('cos_knowledge_facts').select('id', { count: 'exact', head: true })
      .or('embedding.is.null,embedding_model.is.null'),
    db.from('cos_knowledge_facts').select('id', { count: 'exact', head: true })
      .not('embedding', 'is', null).not('embedding_model', 'is', null).neq('embedding_model', model),
  ])
  if (missing.error || stale.error) return null
  return Number(missing.count ?? 0) + Number(stale.count ?? 0)
}

/**
 * Backfill facts that either have no vector OR were embedded by a different model.
 *
 * This distinction is mandatory: two models can both emit vector(768) while occupying unrelated
 * semantic spaces. A provider/embedder migration must therefore regenerate vectors, not merely
 * verify their length. Batches remain bounded and concurrent.
 */
export async function backfillKnowledgeFactEmbeddings(limit = 4): Promise<KnowledgeFactBackfillResult> {
  const db = cosServiceDb()
  if (!db) return { status: 'skipped', attempted: 0, embedded: 0, failed: 0, remaining: null, error: 'COS Supabase service store is not configured' }

  const model = embeddingModelName()
  const requested = Math.max(1, Math.min(8, Math.floor(limit)))
  const missing = await db.from('cos_knowledge_facts')
    .select(FACT_SELECT)
    .or('embedding.is.null,embedding_model.is.null')
    .order('confidence', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(requested)

  if (missing.error) {
    const message = missing.error.message || String(missing.error)
    return { status: 'skipped', attempted: 0, embedded: 0, failed: 0, remaining: null, model, error: message }
  }

  const rows = [...(missing.data ?? [])]
  const remainingSlots = requested - rows.length
  if (remainingSlots > 0) {
    const stale = await db.from('cos_knowledge_facts')
      .select(FACT_SELECT)
      .not('embedding', 'is', null)
      .not('embedding_model', 'is', null)
      .neq('embedding_model', model)
      .order('confidence', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(remainingSlots)
    if (stale.error) {
      return { status: 'skipped', attempted: 0, embedded: 0, failed: 0, remaining: null, model, error: stale.error.message }
    }
    rows.push(...(stale.data ?? []))
  }

  const store = new SupabaseKnowledgeStore(db)
  const attempts = await Promise.allSettled(rows.map(async row => {
    const fact = rowToFact(row)
    const vector = await generatePassiveLocalEmbedding(knowledgeFactEmbeddingText(fact))
    await store.upsertFact(fact, vector)
    return fact.id
  }))

  const embedded = attempts.filter(result => result.status === 'fulfilled').length
  const rejected = attempts.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
  const failed = rejected.length
  const errors = rejected.map(result => result.reason instanceof Error ? result.reason.message : String(result.reason))
  const remaining = await factEmbeddingBacklogCount(model)
  const attempted = rows.length
  const status: KnowledgeFactBackfillResult['status'] = attempted === 0 ? 'skipped' : embedded === 0 && failed > 0 ? 'error' : 'backfilled'

  return {
    status,
    attempted,
    embedded,
    failed,
    remaining,
    model,
    ...(errors.length ? { error: errors.join(' | ').slice(0, 1500) } : {}),
  }
}
