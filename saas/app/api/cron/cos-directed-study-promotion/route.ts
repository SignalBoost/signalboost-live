import { NextRequest, NextResponse } from 'next/server'
import {
  autoPromoteLearnedKnowledge,
  countPendingOwnerDirectedKnowledgePromotion,
} from '@/lib/ai/cos/autoPromoteLearning'
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

  // Manual study should advance automatically, but an empty poll must stay cheap and must not keep
  // inference compute alive. Count first using Supabase only; wake the reasoner only when there is
  // owner-directed promotion work to do.
  const pendingBefore = await countPendingOwnerDirectedKnowledgePromotion()
  if (pendingBefore === null) {
    return NextResponse.json({ ok: false, error: 'Owner-directed promotion state is unavailable.' }, { status: 503 })
  }
  if (pendingBefore === 0) {
    return NextResponse.json({
      ok: true,
      status: 'skipped',
      reason: 'no_owner_directed_promotion_work',
      pendingBefore: 0,
    })
  }

  await touchRunpodActivityLease('owner_directed_knowledge_promotion')
  try {
    await ensureLocalInferenceRuntimeReady()
  } catch (error) {
    console.warn('owner-directed promotion runtime could not be pre-warmed:', error instanceof Error ? error.message : String(error))
  }

  const deadlineMs = Date.now() + 285_000
  const promotion = await autoPromoteLearnedKnowledge(5, deadlineMs, { ownerDirectedOnly: true })
  const pendingAfter = await countPendingOwnerDirectedKnowledgePromotion()
  const ok = promotion.status !== 'error'

  return NextResponse.json({
    ok,
    status: promotion.status,
    pendingBefore,
    pendingAfter,
    promotion,
  }, { status: ok ? 200 : 503 })
}
