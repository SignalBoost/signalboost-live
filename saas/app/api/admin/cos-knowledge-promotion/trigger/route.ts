// saas/app/api/admin/cos-knowledge-promotion/trigger/route.ts
import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { autoPromoteLearnedKnowledge } from '@/lib/ai/cos/autoPromoteLearning'
import { backfillKnowledgeFactEmbeddings } from '@/lib/ai/cos/knowledgeFactSemantic'
import { backfillLearnedCorpusEmbeddings } from '@/lib/ai/cos/learnedCorpusSemantic'
import { seedPlatformSelfKnowledge } from '@/lib/ai/cos/platformSelfKnowledge'
import { touchRunpodActivityLease } from '@/lib/ai/cos/runpodActivityLease'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Owner-session-authenticated manual trigger for the same knowledge-promotion work the daily
 * cron performs (saas/app/api/cron/cos-knowledge-promotion/route.ts, 15 7 * * *). That route only
 * accepts the CRON_SECRET bearer token, which the owner does not carry in a browser session. This
 * route runs the identical sequence under requireOwner() so it can be triggered on demand without
 * exposing or duplicating the cron secret. Logic intentionally mirrors the cron route exactly.
 */
export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  await touchRunpodActivityLease('knowledge_promotion_batch')
  try {
    await ensureLocalInferenceRuntimeReady()
  } catch (error) {
    console.warn('manual COS knowledge promotion local runtime could not be pre-warmed:', error instanceof Error ? error.message : String(error))
  }

  const deadlineMs = Date.now() + 285_000
  const platformSelfKnowledge = await seedPlatformSelfKnowledge()
  const semanticBackfill = await backfillKnowledgeFactEmbeddings(4)
  const corpusBackfill = await backfillLearnedCorpusEmbeddings(4)
  const promotion = await autoPromoteLearnedKnowledge(5, deadlineMs)
  const ok = platformSelfKnowledge.failed === 0 && promotion.status !== 'error' && semanticBackfill.status !== 'error' && corpusBackfill.status !== 'error'
  return NextResponse.json({ ok, triggeredBy: 'owner_manual', platformSelfKnowledge, semanticBackfill, corpusBackfill, promotion }, { status: ok ? 200 : 500 })
}
