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

/**
 * Supabase/PostgREST may cap returned rows below the requested .limit(). Production hit exactly that:
 * the watchdog asked for 5,000 rows, received only the newest 1,000, then treated missing older days
 * inside the seven-day window as real zero-retention days. Read explicit 1,000-row pages until a short
 * page proves exhaustion. If the bounded ceiling is ever reached, fail closed instead of classifying
 * a truncated corpus.
 */
export const CONTINUITY_CORPUS_PAGE_SIZE = 1000
export const CONTINUITY_CORPUS_MAX_PAGES = 250
const GAP_ROW_LIMIT = 5000
const EFFECTIVE_CORPUS_FILTER = 'fact_extraction_error.is.null,fact_extraction_error.not.ilike.relevance_rejected:%'

export type ContinuityReadResult =
  | { ok: true; report: ContinuityReport }
  | { ok: false; error: string }

export type ContinuityCorpusRead =
  | { ok: true; rows: RetentionRow[] }
  | { ok: false; error: string }

export async function readLearningContinuityCorpus(db:any): Promise<ContinuityCorpusRead> {
  const rows:RetentionRow[]=[]
  for(let page=0;page<CONTINUITY_CORPUS_MAX_PAGES;page+=1){
    const from=page*CONTINUITY_CORPUS_PAGE_SIZE
    const to=from+CONTINUITY_CORPUS_PAGE_SIZE-1
    const result=await db
      .from('cos_continuous_learning')
      .select('created_at,subject,source_kind')
      .or(EFFECTIVE_CORPUS_FILTER)
      .order('created_at',{ascending:false})
      .range(from,to)
    if(result.error){
      return {ok:false,error:`cos_continuous_learning read failed: ${result.error.message}`}
    }
    const data=(result.data??[]) as RetentionRow[]
    rows.push(...data)
    if(data.length<CONTINUITY_CORPUS_PAGE_SIZE)return {ok:true,rows}
  }
  return {
    ok:false,
    error:`cos_continuous_learning read exceeded bounded paging ceiling of ${CONTINUITY_CORPUS_PAGE_SIZE*CONTINUITY_CORPUS_MAX_PAGES} rows; refusing to classify a truncated corpus.`,
  }
}

export async function readLearningContinuity(): Promise<ContinuityReadResult> {
  const db = cosServiceDb()
  if (!db) return { ok: false, error: 'COS service database is not configured, so learning continuity cannot be read.' }

  // created_at is when COS learned the row. observed_at is the SOURCE publication date and produces
  // a nonsense "learning per day" chart — rows dated years ago on the day they were acquired.
  // relevance_rejected rows remain in the durable audit corpus but are not live retained knowledge,
  // so continuity must exclude them or quarantined duplicates can fabricate healthy learning volume.
  const corpusResult=await readLearningContinuityCorpus(db)
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
