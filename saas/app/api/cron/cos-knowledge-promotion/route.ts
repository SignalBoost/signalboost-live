import { NextRequest, NextResponse } from 'next/server'
import { autoPromoteLearnedKnowledge } from '@/lib/ai/cos/autoPromoteLearning'
import { backfillKnowledgeFactEmbeddings } from '@/lib/ai/cos/knowledgeFactSemantic'
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

  // Embedding backfill runs before local fact extraction, so wake/lease the shared local runtime
  // once for this bounded batch. If pre-warm fails, existing stages still report their own errors.
  await touchRunpodActivityLease('knowledge_promotion_batch')
  try {
    await ensureLocalInferenceRuntimeReady()
  } catch (error) {
    console.warn('cron COS knowledge promotion local runtime could not be pre-warmed:', error instanceof Error ? error.message : String(error))
  }

  // One route-wide deadline: semantic backfill is bounded to four concurrent rows, then promotion
  // sees the remaining budget and refuses to start model work if too little time remains. The final
  // 15 seconds stay reserved for persistence and the HTTP response.
  const deadlineMs = Date.now() + 285_000
  const semanticBackfill = await backfillKnowledgeFactEmbeddings(4)
  const promotion = await autoPromoteLearnedKnowledge(5, deadlineMs)
  const ok = promotion.status !== 'error' && semanticBackfill.status !== 'error'
  return NextResponse.json({ ok, semanticBackfill, promotion }, { status: ok ? 200 : 500 })
}
