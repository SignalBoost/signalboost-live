import { cosServiceDb } from '@/lib/cos-core/storage/supabase.ts'
import { embeddingModelName } from '@/lib/ai/cos/embeddingEndpoint.ts'
import { embedLearnedCorpusRow } from '@/lib/ai/cos/learnedCorpusSemantic.ts'

const ELIGIBLE_FILTER = 'fact_extraction_error.is.null,fact_extraction_error.not.ilike.relevance_rejected:%'

export type LearnedCorpusIndexingResult = {
  attempted: number
  embedded: number
  failed: number
  remainingEligiblePending: number | null
  errors: string[]
}

type PendingRow = {
  content_hash: string
  subject: string | null
  summary: string | null
  facts: unknown
  fact_extraction_error: string | null
  embedding_model: string | null
  created_at: string
}

function withCreatedAfter<T extends { gte(column: string, value: string): T }>(query: T, createdAfter?: string): T {
  return createdAfter ? query.gte('created_at', createdAfter) : query
}

async function pendingRows(limit: number, createdAfter?: string): Promise<PendingRow[]> {
  const db = cosServiceDb()
  if (!db) return []
  const model = embeddingModelName()
  const select = 'content_hash,subject,summary,facts,fact_extraction_error,embedding_model,created_at'

  let missingQuery = db
    .from('cos_continuous_learning')
    .select(select)
    .or('embedding.is.null,embedding_model.is.null')
    .or(ELIGIBLE_FILTER)
    .order('created_at', { ascending: false })
    .limit(limit)
  missingQuery = withCreatedAfter(missingQuery as any, createdAfter) as any
  const missing = await missingQuery
  if (missing.error) throw missing.error

  let staleQuery = db
    .from('cos_continuous_learning')
    .select(select)
    .not('embedding', 'is', null)
    .not('embedding_model', 'is', null)
    .neq('embedding_model', model)
    .or(ELIGIBLE_FILTER)
    .order('created_at', { ascending: false })
    .limit(limit)
  staleQuery = withCreatedAfter(staleQuery as any, createdAfter) as any
  const stale = await staleQuery
  if (stale.error) throw stale.error

  const combined = [...(missing.data ?? []), ...(stale.data ?? [])] as PendingRow[]
  return [...new Map(combined.map(row => [String(row.content_hash), row])).values()]
    .sort((a, b) => Date.parse(String(b.created_at || 0)) - Date.parse(String(a.created_at || 0)))
    .slice(0, limit)
}

export async function countPendingLearnedCorpusIndexing(options: { createdAfter?: string } = {}): Promise<number | null> {
  const db = cosServiceDb()
  if (!db) return null
  const model = embeddingModelName()

  let missingQuery = db
    .from('cos_continuous_learning')
    .select('content_hash', { count: 'exact', head: true })
    .or('embedding.is.null,embedding_model.is.null')
    .or(ELIGIBLE_FILTER)
  missingQuery = withCreatedAfter(missingQuery as any, options.createdAfter) as any

  let staleQuery = db
    .from('cos_continuous_learning')
    .select('content_hash', { count: 'exact', head: true })
    .not('embedding', 'is', null)
    .not('embedding_model', 'is', null)
    .neq('embedding_model', model)
    .or(ELIGIBLE_FILTER)
  staleQuery = withCreatedAfter(staleQuery as any, options.createdAfter) as any

  const [missing, stale] = await Promise.all([missingQuery, staleQuery])
  if (missing.error || stale.error) return null
  return Math.max(0, Number(missing.count ?? 0)) + Math.max(0, Number(stale.count ?? 0))
}

/**
 * Index the newest admitted knowledge first so fresh learning becomes semantically retrievable
 * within minutes rather than waiting behind older maintenance work. Rows carrying vectors from a
 * previous embedding model are also re-indexed because active retrieval intentionally excludes
 * vectors from incompatible semantic spaces. Retention is never rolled back if embedding is
 * unavailable; failures remain visible and are retried by the next bounded run.
 */
export async function indexRecentUnembeddedLearnedCorpus(options: {
  limit?: number
  concurrency?: number
  createdAfter?: string
} = {}): Promise<LearnedCorpusIndexingResult> {
  const limit = Math.max(1, Math.min(32, Math.floor(options.limit ?? 16)))
  const concurrency = Math.max(1, Math.min(4, Math.floor(options.concurrency ?? 4)))
  const rows = await pendingRows(limit, options.createdAfter)
  let cursor = 0
  let embedded = 0
  let failed = 0
  const errors: string[] = []

  const worker = async () => {
    while (true) {
      const index = cursor++
      if (index >= rows.length) return
      const row = rows[index]
      try {
        const outcome = await embedLearnedCorpusRow(row)
        if (outcome.embedded) embedded += 1
        else {
          failed += 1
          if (outcome.error) errors.push(outcome.error)
        }
      } catch (error) {
        failed += 1
        errors.push(error instanceof Error ? error.message : String(error))
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length || 1) }, () => worker()))
  return {
    attempted: rows.length,
    embedded,
    failed,
    remainingEligiblePending: await countPendingLearnedCorpusIndexing(),
    errors: [...new Set(errors)].slice(0, 8),
  }
}
