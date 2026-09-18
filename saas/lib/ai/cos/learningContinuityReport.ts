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
 * Enough history for a 14-day comparison with headroom. The corpus is small by design (retention is
 * selective), so this is a full read in practice rather than a sample.
 */
const CORPUS_ROW_LIMIT = 5000
const GAP_ROW_LIMIT = 5000

export type ContinuityReadResult =
  | { ok: true; report: ContinuityReport }
  | { ok: false; error: string }

export async function readLearningContinuity(): Promise<ContinuityReadResult> {
  const db = cosServiceDb()
  if (!db) return { ok: false, error: 'COS service database is not configured, so learning continuity cannot be read.' }

  // created_at is when COS learned the row. observed_at is the SOURCE publication date and produces
  // a nonsense "learning per day" chart — rows dated years ago on the day they were acquired.
  const corpusResult = await db
    .from('cos_continuous_learning')
    .select('created_at,subject,source_kind')
    .order('created_at', { ascending: false })
    .limit(CORPUS_ROW_LIMIT)
  if (corpusResult.error) return { ok: false, error: `cos_continuous_learning read failed: ${corpusResult.error.message}` }

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

  const corpus = (corpusResult.data ?? []) as RetentionRow[]
  return { ok: true, report: assessLearningContinuity(corpus, gapStatusCounts) }
}
