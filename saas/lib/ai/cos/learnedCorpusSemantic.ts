// saas/lib/ai/cos/learnedCorpusSemantic.ts
//
// SEMANTIC RETRIEVAL FOR THE LEARNED CORPUS — the missing half.
//
// cos_knowledge_facts already retrieves by meaning (queryNearestFacts → cos_match_knowledge_facts).
// cos_continuous_learning did not: it was pulled by keyword ILIKE and only THEN reranked, so a
// relevant row worded differently never entered the funnel and showed up as "0 cited". This module
// is the deliberate corpus-side mirror of lib/ai/cos/knowledgeFactSemantic.ts: nearest-neighbour
// retrieval, embed-on-write, and incremental backfill of pre-existing rows.
//
// The embedding text mirrors what the reasoner is actually shown for a corpus row (subject +
// summary + a few extracted facts), so "what we index" and "what we reason over" stay aligned —
// indexing a different projection than we display is how semantic retrieval silently drifts.

// Platform dependencies (embedding client, Supabase service store) are imported LAZILY inside the
// functions that need them, so this module loads without pulling @supabase/supabase-js. That keeps
// the pure projection (learnedCorpusEmbeddingText) unit-testable in isolation — the same discipline
// that made cosAnswerPolicy testable while cosFirstAnswer was not.
type ServiceDb = NonNullable<Awaited<ReturnType<typeof import('@/lib/cos-core/storage/supabase')['cosServiceDb']>>>
async function serviceDb(): Promise<ServiceDb | null> {
  const { cosServiceDb } = await import('@/lib/cos-core/storage/supabase')
  return cosServiceDb() as ServiceDb | null
}
async function embed(text: string): Promise<number[]> {
  const { generateLocalEmbedding } = await import('@/lib/ai/cos/localEmbeddings')
  return generateLocalEmbedding(text)
}

export type LearnedCorpusRow = {
  content_hash: string
  subject: string
  summary: string
  facts: unknown
  confidence: number
  source_kind: string
  source_uri: string
  observed_at: string
  similarity?: number
}

export type LearnedCorpusBackfillResult = {
  status: 'backfilled' | 'skipped' | 'error'
  attempted: number
  embedded: number
  failed: number
  remaining: number | null
  error?: string
}

/**
 * The text a corpus row is embedded under. Kept in lockstep with the reasoner-facing projection in
 * cosFirstAnswerEnterprise: subject, summary, and up to six extracted facts. Truncated generously —
 * nomic-embed-text handles long inputs, and a fuller projection embeds the row's actual content
 * rather than just its title.
 */
export function learnedCorpusEmbeddingText(row: {
  subject?: unknown
  summary?: unknown
  facts?: unknown
}): string {
  const clip = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
  const facts = Array.isArray(row.facts)
    ? row.facts.slice(0, 6).map(fact => clip(fact, 400)).filter(Boolean).join(' ')
    : ''
  return [clip(row.subject, 240), clip(row.summary, 1600), facts].filter(Boolean).join('\n')
}

/**
 * Nearest corpus rows to a query embedding, via the cos_match_continuous_learning RPC. Mirrors
 * SupabaseKnowledgeStore.queryNearestFacts: caller-supplied match count and floor, clamped server
 * and client side, similarity returned per row so the reasoner block can show it.
 */
export async function queryNearestLearnedCorpus(
  vector: number[],
  options: { matchCount?: number; minSimilarity?: number } = {},
): Promise<LearnedCorpusRow[]> {
  const db = await serviceDb()
  if (!db) return []
  const { data, error } = await db.rpc('cos_match_continuous_learning', {
    query_embedding: vector,
    match_count: Math.max(1, Math.min(64, Math.floor(options.matchCount ?? 24))),
    min_similarity: Math.max(0, Math.min(1, options.minSimilarity ?? 0.45)),
  })
  if (error) throw error
  return (data ?? []).map((row: any): LearnedCorpusRow => ({
    content_hash: String(row.content_hash),
    subject: String(row.subject ?? ''),
    summary: String(row.summary ?? ''),
    facts: row.facts ?? [],
    confidence: Number(row.confidence ?? 0),
    source_kind: String(row.source_kind ?? ''),
    source_uri: String(row.source_uri ?? ''),
    observed_at: String(row.observed_at ?? ''),
    similarity: Number(row.similarity ?? 0),
  }))
}

/**
 * Attach an embedding to a single corpus row, keyed by content_hash. Best-effort by design and by
 * precedent (persistKnowledgeFactWithEmbedding does the same for facts): a cold embedding model
 * must never make a learning write fail. An un-embedded row still serves through the lexical path
 * and is upgraded later by the backfill.
 */
export async function embedLearnedCorpusRow(row: {
  content_hash: string
  subject?: unknown
  summary?: unknown
  facts?: unknown
}): Promise<{ embedded: boolean; error?: string }> {
  const db = await serviceDb()
  if (!db) return { embedded: false, error: 'COS Supabase service store is not configured' }
  try {
    const vector = await embed(learnedCorpusEmbeddingText(row))
    const { error } = await db.from('cos_continuous_learning').update({ embedding: vector }).eq('content_hash', row.content_hash)
    if (error) throw error
    return { embedded: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('learnedCorpusSemantic: embedding unavailable; row stored without vector', { contentHash: row.content_hash, error: message })
    return { embedded: false, error: message }
  }
}

/**
 * Incrementally embed pre-existing corpus rows after the vector-column migration lands. Bounded,
 * concurrency-batched, highest-confidence first — a direct mirror of backfillKnowledgeFactEmbeddings
 * so both corpora upgrade the same way and one operator playbook covers both.
 */
export async function backfillLearnedCorpusEmbeddings(limit = 4): Promise<LearnedCorpusBackfillResult> {
  const db = await serviceDb()
  if (!db) return { status: 'skipped', attempted: 0, embedded: 0, failed: 0, remaining: null, error: 'COS Supabase service store is not configured' }

  const requested = Math.max(1, Math.min(8, Math.floor(limit)))
  const pending = await db.from('cos_continuous_learning')
    .select('content_hash,subject,summary,facts,confidence')
    .is('embedding', null)
    .order('confidence', { ascending: false })
    .order('observed_at', { ascending: false })
    .limit(requested)

  if (pending.error) {
    const message = pending.error.message || String(pending.error)
    console.warn('learnedCorpusSemantic: embedding backfill skipped', message)
    return { status: 'skipped', attempted: 0, embedded: 0, failed: 0, remaining: null, error: message }
  }

  const attempts = await Promise.allSettled((pending.data ?? []).map(async row => {
    const vector = await embed(learnedCorpusEmbeddingText(row))
    const { error } = await db.from('cos_continuous_learning').update({ embedding: vector }).eq('content_hash', row.content_hash)
    if (error) throw error
    return row.content_hash
  }))

  const embedded = attempts.filter(result => result.status === 'fulfilled').length
  const rejected = attempts.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
  const failed = rejected.length
  const errors = rejected.map(result => (result.reason instanceof Error ? result.reason.message : String(result.reason)))

  const remainingQuery = await db.from('cos_continuous_learning').select('content_hash', { count: 'exact', head: true }).is('embedding', null)
  const remaining = remainingQuery.error ? null : remainingQuery.count ?? 0
  const attempted = (pending.data ?? []).length
  const status: LearnedCorpusBackfillResult['status'] = attempted === 0 ? 'skipped' : embedded === 0 && failed > 0 ? 'error' : 'backfilled'

  return { status, attempted, embedded, failed, remaining, ...(errors.length ? { error: errors.join(' | ').slice(0, 1500) } : {}) }
}
