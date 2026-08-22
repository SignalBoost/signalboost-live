import { cosServiceDb } from '@/lib/cos-core/storage/supabase.ts'
import { embedLearnedCorpusRow } from '@/lib/ai/cos/learnedCorpusSemantic.ts'

const ELIGIBLE_FILTER = 'fact_extraction_error.is.null,fact_extraction_error.not.ilike.relevance_rejected:%'

export type LearnedCorpusIndexingResult = {
  attempted: number
  embedded: number
  failed: number
  remainingEligibleUnembedded: number | null
  errors: string[]
}

type PendingRow = {
  content_hash: string
  subject: string | null
  summary: string | null
  facts: unknown
  fact_extraction_error: string | null
}

async function pendingRows(limit: number, createdAfter?: string): Promise<PendingRow[]> {
  const db = cosServiceDb()
  if (!db) return []
  let query = db
    .from('cos_continuous_learning')
    .select('content_hash,subject,summary,facts,fact_extraction_error,created_at')
    .is('embedding', null)
    .or(ELIGIBLE_FILTER)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (createdAfter) query = query.gte('created_at', createdAfter)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as PendingRow[]
}

async function remainingCount(): Promise<number | null> {
  const db = cosServiceDb()
  if (!db) return null
  const { count, error } = await db
    .from('cos_continuous_learning')
    .select('content_hash', { count: 'exact', head: true })
    .is('embedding', null)
    .or(ELIGIBLE_FILTER)
  if (error) return null
  return count ?? 0
}

/**
 * Index the newest admitted knowledge first so fresh learning becomes semantically retrievable
 * within minutes rather than waiting behind older maintenance work. Retention is never rolled back
 * if embedding is unavailable; failures remain visible and are retried by the next bounded run.
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
    remainingEligibleUnembedded: await remainingCount(),
    errors: [...new Set(errors)].slice(0, 8),
  }
}
