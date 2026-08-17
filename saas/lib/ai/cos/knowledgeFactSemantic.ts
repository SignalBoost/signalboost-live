import { generatePassiveLocalEmbedding } from '@/lib/ai/cos/localEmbeddings'
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
  error?: string
}

export function knowledgeFactEmbeddingText(fact: Pick<KnowledgeFact, 'subject' | 'predicate' | 'object'>): string {
  return `${fact.subject}\n${fact.predicate}\n${fact.object}`
}

/**
 * A fact never silently overwrites a different existing claim for the same (task, subject,
 * predicate) — see cognitiveFactConsolidation.ts for why. This reads the existing row first,
 * resolves any contradiction (higher confidence wins, loser is penalized not deleted), and audits
 * the outcome to cos_knowledge_fact_revisions before writing. Reaffirming the same claim (no
 * material difference) or writing a brand-new subject/predicate both skip the audit — there is
 * nothing to reconcile.
 */
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

/**
 * Incrementally upgrade pre-existing facts after the vector column migration is applied.
 * The bounded batch is embedded concurrently so one slow local-model request defines the batch
 * latency instead of multiplying that latency by every row in the batch.
 */
export async function backfillKnowledgeFactEmbeddings(limit = 4): Promise<KnowledgeFactBackfillResult> {
  const db = cosServiceDb()
  if (!db) return { status: 'skipped', attempted: 0, embedded: 0, failed: 0, remaining: null, error: 'COS Supabase service store is not configured' }

  const requested = Math.max(1, Math.min(8, Math.floor(limit)))
  const pending = await db.from('cos_knowledge_facts')
    .select('id,task_id,subject,predicate,object,confidence,source,updated_at')
    .is('embedding', null)
    .order('confidence', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(requested)

  if (pending.error) {
    const message = pending.error.message || String(pending.error)
    console.warn('cosKnowledgeFact: embedding backfill skipped', message)
    return { status: 'skipped', attempted: 0, embedded: 0, failed: 0, remaining: null, error: message }
  }

  const store = new SupabaseKnowledgeStore(db)
  const attempts = await Promise.allSettled((pending.data ?? []).map(async row => {
    const fact = rowToFact(row)
    const vector = await generatePassiveLocalEmbedding(knowledgeFactEmbeddingText(fact))
    await store.upsertFact(fact, vector)
    return fact.id
  }))

  const embedded = attempts.filter(result => result.status === 'fulfilled').length
  const rejected = attempts.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
  const failed = rejected.length
  const errors = rejected.map(result => result.reason instanceof Error ? result.reason.message : String(result.reason))

  const remainingQuery = await db.from('cos_knowledge_facts')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null)
  const remaining = remainingQuery.error ? null : remainingQuery.count ?? 0
  const attempted = (pending.data ?? []).length
  const status: KnowledgeFactBackfillResult['status'] = attempted === 0 ? 'skipped' : embedded === 0 && failed > 0 ? 'error' : 'backfilled'

  return {
    status,
    attempted,
    embedded,
    failed,
    remaining,
    ...(errors.length ? { error: errors.join(' | ').slice(0, 1500) } : {}),
  }
}
