// saas/lib/ai/cos/learnedCorpusSemantic.ts
//
// Semantic retrieval + governed embedding backfill for the learned corpus.

type ServiceDb = NonNullable<Awaited<ReturnType<typeof import('@/lib/cos-core/storage/supabase')['cosServiceDb']>>>

const REJECTED_PREFIX = 'relevance_rejected:'
const ELIGIBLE_FILTER = `fact_extraction_error.is.null,fact_extraction_error.not.ilike.${REJECTED_PREFIX}%`

async function serviceDb(): Promise<ServiceDb | null> {
  const { cosServiceDb } = await import('@/lib/cos-core/storage/supabase')
  return cosServiceDb() as ServiceDb | null
}

async function embed(text: string): Promise<number[]> {
  const { generateLocalEmbedding } = await import('@/lib/ai/cos/localEmbeddings')
  return generateLocalEmbedding(text)
}

function stableText(value: unknown, max: number): string {
  let raw: string
  if (typeof value === 'string') raw = value
  else if (value && typeof value === 'object') {
    try { raw = JSON.stringify(value) } catch { raw = String(value) }
  } else raw = String(value ?? '')
  return raw.replace(/\s+/g, ' ').trim().slice(0, max)
}

export function learnedCorpusRowRejected(row: { fact_extraction_error?: unknown }): boolean {
  return String(row.fact_extraction_error ?? '').trim().toLowerCase().startsWith(REJECTED_PREFIX)
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

export type LearnedCorpusEmbeddingStats = {
  total: number | null
  rejected: number | null
  eligible: number | null
  eligibleEmbedded: number | null
  pending: number | null
}

/** The exact subject + summary + structured-facts projection used for local corpus embeddings. */
export function learnedCorpusEmbeddingText(row: {
  subject?: unknown
  summary?: unknown
  facts?: unknown
}): string {
  const facts = Array.isArray(row.facts)
    ? row.facts.slice(0, 6).map(fact => stableText(fact, 400)).filter(Boolean).join(' ')
    : ''
  return [stableText(row.subject, 240), stableText(row.summary, 1600), facts].filter(Boolean).join('\n')
}

/** Nearest retained corpus rows. Rejected rows are excluded by the database RPC. */
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

/** Truthful learned-corpus embedding state. Total retained rows never doubles as the backlog. */
export async function getLearnedCorpusEmbeddingStats(): Promise<LearnedCorpusEmbeddingStats> {
  const db = await serviceDb()
  if (!db) return { total: null, rejected: null, eligible: null, eligibleEmbedded: null, pending: null }

  const [totalResult, rejectedResult, embeddedResult] = await Promise.all([
    db.from('cos_continuous_learning').select('content_hash', { count: 'exact', head: true }),
    db.from('cos_continuous_learning').select('content_hash', { count: 'exact', head: true }).ilike('fact_extraction_error', `${REJECTED_PREFIX}%`),
    db.from('cos_continuous_learning').select('content_hash', { count: 'exact', head: true }).not('embedding', 'is', null).or(ELIGIBLE_FILTER),
  ])

  if (totalResult.error || rejectedResult.error || embeddedResult.error) {
    return { total: null, rejected: null, eligible: null, eligibleEmbedded: null, pending: null }
  }

  const total = totalResult.count ?? 0
  const rejected = rejectedResult.count ?? 0
  const eligible = Math.max(0, total - rejected)
  const eligibleEmbedded = Math.max(0, Math.min(eligible, embeddedResult.count ?? 0))
  const pending = Math.max(0, eligible - eligibleEmbedded)
  return { total, rejected, eligible, eligibleEmbedded, pending }
}

/** Number of useful retained rows still missing an embedding. Quarantined rows do not count. */
export async function countPendingLearnedCorpusEmbeddings(): Promise<number | null> {
  return (await getLearnedCorpusEmbeddingStats()).pending
}

/** Best-effort embed-on-write for one accepted corpus row. */
export async function embedLearnedCorpusRow(row: {
  content_hash: string
  subject?: unknown
  summary?: unknown
  facts?: unknown
  fact_extraction_error?: unknown
}): Promise<{ embedded: boolean; error?: string }> {
  if (learnedCorpusRowRejected(row)) {
    return { embedded: false, error: 'relevance-rejected corpus rows are not embeddable' }
  }
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
 * Incrementally embed only eligible retained corpus rows. Relevance-rejected rows intentionally stay
 * unembedded so semantic retrieval and backfill status cannot mistake quarantine for usable memory.
 */
export async function backfillLearnedCorpusEmbeddings(limit = 4): Promise<LearnedCorpusBackfillResult> {
  const db = await serviceDb()
  if (!db) return { status: 'skipped', attempted: 0, embedded: 0, failed: 0, remaining: null, error: 'COS Supabase service store is not configured' }

  const requested = Math.max(1, Math.min(8, Math.floor(limit)))
  const pending = await db.from('cos_continuous_learning')
    .select('content_hash,subject,summary,facts,confidence,fact_extraction_error')
    .is('embedding', null)
    .or(ELIGIBLE_FILTER)
    .order('confidence', { ascending: false })
    .order('observed_at', { ascending: false })
    .limit(requested)

  if (pending.error) {
    const message = pending.error.message || String(pending.error)
    console.warn('learnedCorpusSemantic: embedding backfill skipped', message)
    return { status: 'skipped', attempted: 0, embedded: 0, failed: 0, remaining: null, error: message }
  }

  const eligible = (pending.data ?? []).filter(row => !learnedCorpusRowRejected(row))
  const attempts = await Promise.allSettled(eligible.map(async row => {
    const vector = await embed(learnedCorpusEmbeddingText(row))
    const { error } = await db.from('cos_continuous_learning').update({ embedding: vector }).eq('content_hash', row.content_hash)
    if (error) throw error
    return row.content_hash
  }))

  const embedded = attempts.filter(result => result.status === 'fulfilled').length
  const rejected = attempts.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
  const failed = rejected.length
  const errors = rejected.map(result => (result.reason instanceof Error ? result.reason.message : String(result.reason)))
  const remaining = await countPendingLearnedCorpusEmbeddings()
  const attempted = eligible.length
  const status: LearnedCorpusBackfillResult['status'] = attempted === 0 ? 'skipped' : embedded === 0 && failed > 0 ? 'error' : 'backfilled'

  return { status, attempted, embedded, failed, remaining, ...(errors.length ? { error: errors.join(' | ').slice(0, 1500) } : {}) }
}
