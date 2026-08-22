import { NextRequest, NextResponse } from 'next/server'
import { indexRecentUnembeddedLearnedCorpus } from '@/lib/ai/cos/learnedCorpusIndexing.ts'
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

  await touchRunpodActivityLease('learned_corpus_index_batch')
  try {
    await ensureLocalInferenceRuntimeReady()
  } catch (error) {
    console.warn('learned-corpus indexer runtime could not be pre-warmed:', error instanceof Error ? error.message : String(error))
  }

  const result = await indexRecentUnembeddedLearnedCorpus({ limit: 16, concurrency: 4 })
  const ok = result.failed === 0 || result.embedded > 0
  return NextResponse.json({ ok, ...result }, { status: ok ? 200 : 503 })
}
