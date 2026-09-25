//
// The single reader both callers share — the owner endpoint and the watchdog cron. Two readers would
// eventually disagree about what "learning" counts as, and the first time they disagreed the alert
// would be the one that was wrong.
//
// Reads only. It never writes, never triggers a cycle, and never calls a model.

import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  assessLearningContinuity,
  type ContinuityReport,
  type GapStatusCount,
  type RetentionRow,
} from '@/lib/ai/cos/learningContinuity'
import {
  readLearningContinuityCorpus,
} from './learningContinuityPagination.ts'

/**
 * Supabase/PostgREST may cap returned rows below the requested .limit(). Production hit exactly that:
 * the watchdog asked for 5,000 rows, received only the newest 1,000, then treated missing older days
 * inside the seven-day window as real zero-retention days. The shared pure pagination helper reads
 * explicit pages and fails closed if its bounded ceiling is ever reached.
 */
const GAP_ROW_LIMIT = 5000
const EFFECTIVE_CORPUS_FILTER = 'fact_extraction_error.is.null,fact_extraction_error.not.ilike.relevance_rejected:%'

export type ContinuityReadResult =
  | { ok: true; report: ContinuityReport }
  | { ok: false; error: string }

export async function readLearningContinuity(): Promise<ContinuityReadResult> {
  const db = cosServiceDb()
  if (!db) return { ok: false, error: 'COS service database is not configured, so learning continuity cannot be read.' }

  // created_at is when COS learned the row. observed_at is the SOURCE publication date and produces
  // a nonsense "learning per day" chart — rows dated years ago on the day they were acquired.
  // relevance_rejected rows remain in the durable audit corpus but are not live retained knowledge,
  // so continuity must exclude them or quarantined duplicates can fabricate healthy learning volume.
  const corpusResult=await readLearningContinuityCorpus(db,EFFECTIVE_CORPUS_FILTER)
  if(!corpusResult.ok)return {ok:false,error:corpusResult.error}

  const gapResult = await db
    .from('cos_learning_gaps')
    .select('status')
    .limit(GAP_ROW_LIMIT)

  // A missing gap table must not take the whole check down — corpus freshness is the primary signal
  // and it is readable without gaps. The gap-derived finding simply does not fire.
  const gapCounts = new Map<string, number>()
  if (!gapResult.error) {
    for (const row of (gapResult.data ?? []) as Array<{ status?: string | null }>) {
      const status = String(row.status ?? '').trim().toLowerCase() || 'unknown'
      gapCounts.set(status, (gapCounts.get(status) ?? 0) + 1)
    }
  }
  const gapStatusCounts: GapStatusCount[] = [...gapCounts.entries()].map(([status, count]) => ({ status, count }))

  return { ok: true, report: assessLearningContinuity(corpusResult.rows, gapStatusCounts) }
}
