import { NextRequest, NextResponse } from 'next/server'
import {
  countPendingLearnedCorpusIndexing,
  indexRecentUnembeddedLearnedCorpus,
} from '@/lib/ai/cos/learnedCorpusIndexing.ts'
import { touchRunpodActivityLease } from '@/lib/ai/cos/runpodActivityLease.ts'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Do not record activity or wake embedding compute for an empty maintenance cycle. Otherwise a
  // 15-minute cron can indefinitely postpone idle-stop simply by touching the lease when no work
  // exists. The count is database-only and includes both missing vectors and stale-model vectors.
  const pending = await countPendingLearnedCorpusIndexing()
  if (pending === null) {
    return NextResponse.json({ ok: false, error: 'COS learned-corpus indexing state is unavailable.' }, { status: 503 })
  }
  if (pending === 0) {
    return NextResponse.json({
      ok: true,
      status: 'skipped',
      reason: 'no_indexing_work',
      attempted: 0,
      embedded: 0,
      failed: 0,
      remainingEligiblePending: 0,
      errors: [],
    })
  }

  await touchRunpodActivityLease('learned_corpus_index_batch')
  try {
    await ensureLocalInferenceRuntimeReady()
  } catch (error) {
    console.warn('learned-corpus indexer runtime could not be pre-warmed:', error instanceof Error ? error.message : String(error))
  }

  // Drain a bounded backlog window per invocation instead of only 16 rows. At the previous
  // four-runs/hour cadence, a large retained corpus could remain semantically unavailable for weeks.
  // Three 32-row batches keep the 300s route bounded while making historical learning reusable by COS.
  const MAX_BATCHES = 3
  let attempted = 0
  let embedded = 0
  let failed = 0
  let remainingEligiblePending: number | null = pending
  const errors: string[] = []
  let batches = 0
  for (let index = 0; index < MAX_BATCHES && Number(remainingEligiblePending ?? 1) > 0; index += 1) {
    await touchRunpodActivityLease('learned_corpus_index_batch')
    const batch = await indexRecentUnembeddedLearnedCorpus({ limit: 32, concurrency: 4 })
    batches += 1
    attempted += batch.attempted
    embedded += batch.embedded
    failed += batch.failed
    remainingEligiblePending = batch.remainingEligiblePending
    errors.push(...batch.errors)
    if (batch.attempted === 0 || batch.embedded === 0) break
  }
  const ok = failed === 0 || embedded > 0
  return NextResponse.json({
    ok,
    status: 'indexed',
    batches,
    attempted,
    embedded,
    failed,
    remainingEligiblePending,
    errors: [...new Set(errors)].slice(0, 8),
  }, { status: ok ? 200 : 503 })
}
