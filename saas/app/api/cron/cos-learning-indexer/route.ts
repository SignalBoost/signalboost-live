import { NextRequest, NextResponse } from 'next/server'
import {
  countPendingLearnedCorpusIndexing,
  indexRecentUnembeddedLearnedCorpus,
} from '@/lib/ai/cos/learnedCorpusIndexing.ts'
import { touchRunpodActivityLease } from '@/lib/ai/cos/runpodActivityLease.ts'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference.ts'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function recordIndexerTelemetry(values: Record<string, unknown>) {
  const db = cosServiceDb()
  if (!db) return
  const result = await db.from('cos_learning_indexer_telemetry').upsert({ id: 'continuous_indexer', ...values, updated_at: new Date().toISOString() }, { onConflict: 'id' })
  if (result.error) console.warn('cos-learning-indexer telemetry write failed:', result.error.message)
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const startedIso = new Date(startedAt).toISOString()

  // Do not record activity or wake embedding compute for an empty maintenance cycle. Otherwise a
  // 15-minute cron can indefinitely postpone idle-stop simply by touching the lease when no work
  // exists. The count is database-only and includes both missing vectors and stale-model vectors.
  const pending = await countPendingLearnedCorpusIndexing()
  if (pending === null) {
    await recordIndexerTelemetry({ last_started_at: startedIso, last_completed_at: new Date().toISOString(), status: 'error', error: 'indexing_state_unavailable', duration_ms: Date.now() - startedAt })
    return NextResponse.json({ ok: false, error: 'COS learned-corpus indexing state is unavailable.' }, { status: 503 })
  }
  if (pending === 0) {
    await recordIndexerTelemetry({ last_started_at: startedIso, last_completed_at: new Date().toISOString(), status: 'skipped', attempted: 0, embedded: 0, failed: 0, pending_before: 0, pending_after: 0, duration_ms: Date.now() - startedAt, error: null })
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
  // Eight 32-row batches keep each run bounded while continuously draining the retained-knowledge backlog without owner clicks.
  const MAX_BATCHES = 8
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
  await recordIndexerTelemetry({
    last_started_at: startedIso,
    last_completed_at: new Date().toISOString(),
    status: ok ? 'healthy' : 'error', attempted, embedded, failed,
    pending_before: pending, pending_after: remainingEligiblePending,
    duration_ms: Date.now() - startedAt,
    error: errors.length ? [...new Set(errors)].join(' | ').slice(0, 1500) : null,
  })
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
