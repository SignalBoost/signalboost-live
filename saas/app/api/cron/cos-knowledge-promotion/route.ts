// saas/app/api/cron/cos-knowledge-promotion/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { autoPromoteLearnedKnowledge } from '@/lib/ai/cos/autoPromoteLearning'
import { backfillKnowledgeFactEmbeddings } from '@/lib/ai/cos/knowledgeFactSemantic'
import { backfillLearnedCorpusEmbeddings } from '@/lib/ai/cos/learnedCorpusSemantic'
import { seedPlatformSelfKnowledge } from '@/lib/ai/cos/platformSelfKnowledge'
import { touchRunpodActivityLease } from '@/lib/ai/cos/runpodActivityLease'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Embedding work runs under one governed wake/lease owned by this bounded knowledge-promotion job.
  // The self-knowledge seeder itself uses only passive embeddings and cannot independently wake GPU
  // compute; this route performs readiness explicitly before invoking it.
  await touchRunpodActivityLease('knowledge_promotion_batch')
  try {
    await ensureLocalInferenceRuntimeReady()
  } catch (error) {
    console.warn('cron COS knowledge promotion local runtime could not be pre-warmed:', error instanceof Error ? error.message : String(error))
  }

  // One route-wide deadline: first ensure the small versioned set of code-derived platform facts is
  // present with embeddings, then drain older semantic backlogs and promote learned knowledge. The
  // final 15 seconds stay reserved for persistence and the HTTP response.
  const deadlineMs = Date.now() + 285_000
  const platformSelfKnowledge = await seedPlatformSelfKnowledge()
  const semanticBackfill = await backfillKnowledgeFactEmbeddings(4)
  const corpusBackfill = await backfillLearnedCorpusEmbeddings(4)
  const promotion = await autoPromoteLearnedKnowledge(5, deadlineMs)
  const ok = platformSelfKnowledge.failed === 0 && promotion.status !== 'error' && semanticBackfill.status !== 'error' && corpusBackfill.status !== 'error'
  return NextResponse.json({ ok, platformSelfKnowledge, semanticBackfill, corpusBackfill, promotion }, { status: ok ? 200 : 500 })
}
