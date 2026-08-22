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

  const result = await indexRecentUnembeddedLearnedCorpus({ limit: 16, concurrency: 4 })
  const ok = result.failed === 0 || result.embedded > 0
  return NextResponse.json({ ok, status: 'indexed', ...result }, { status: ok ? 200 : 503 })
}
