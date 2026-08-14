import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference'
import { touchRunpodActivityLease } from '@/lib/ai/cos/runpodActivityLease'
import { backfillLearnedCorpusEmbeddings } from '@/lib/ai/cos/learnedCorpusSemantic'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BATCH_SIZE = 8
const MAX_BATCHES = 12

async function remainingCount(): Promise<number | null> {
  const db = cosServiceDb()
  if (!db) return null
  const result = await db
    .from('cos_continuous_learning')
    .select('content_hash', { count: 'exact', head: true })
    .is('embedding', null)
  if (result.error) throw result.error
  return result.count ?? 0
}

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  try {
    return NextResponse.json({ ok: true, remaining: await remainingCount(), batchSize: BATCH_SIZE })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unable to read learned-corpus embedding backlog.' },
      { status: 500 },
    )
  }
}

export async function POST() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const startedAt = Date.now()
  let attempted = 0
  let embedded = 0
  let failed = 0
  let batches = 0
  let remaining: number | null = null
  const errors: string[] = []

  try {
    await touchRunpodActivityLease('learned_corpus_embedding_backfill')
    await ensureLocalInferenceRuntimeReady()

    for (let index = 0; index < MAX_BATCHES; index += 1) {
      await touchRunpodActivityLease('learned_corpus_embedding_backfill')
      const result = await backfillLearnedCorpusEmbeddings(BATCH_SIZE)
      batches += 1
      attempted += result.attempted
      embedded += result.embedded
      failed += result.failed
      remaining = result.remaining
      if (result.error) errors.push(result.error)

      if (remaining === 0 || result.attempted === 0) break
      if (result.embedded === 0) break
    }

    if (remaining == null) remaining = await remainingCount()

    return NextResponse.json({
      ok: true,
      completed: remaining === 0,
      attempted,
      embedded,
      failed,
      remaining,
      batches,
      batchSize: BATCH_SIZE,
      durationMs: Date.now() - startedAt,
      ...(errors.length ? { error: errors.join(' | ').slice(0, 2000) } : {}),
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        attempted,
        embedded,
        failed,
        remaining,
        batches,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'Learned-corpus embedding backfill failed.',
      },
      { status: 500 },
    )
  }
}
