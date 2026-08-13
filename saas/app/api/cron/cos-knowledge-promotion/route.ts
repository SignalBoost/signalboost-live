import { NextRequest, NextResponse } from 'next/server'
import { autoPromoteLearnedKnowledge } from '@/lib/ai/cos/autoPromoteLearning'
import { backfillKnowledgeFactEmbeddings } from '@/lib/ai/cos/knowledgeFactSemantic'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Upgrade a small bounded batch of pre-existing facts first. If the vector migration has not
  // reached this database yet the helper reports skipped and fact promotion continues normally.
  const semanticBackfill = await backfillKnowledgeFactEmbeddings(8)

  // Leave 15 seconds for persistence and the HTTP response. autoPromoteLearnedKnowledge
  // will not begin another local-model extraction unless enough time remains for a cold
  // start plus inference, so Vercel cannot kill this route merely because earlier work
  // consumed most of the route deadline.
  const deadlineMs = Date.now() + 285_000
  const promotion = await autoPromoteLearnedKnowledge(5, deadlineMs)
  const ok = promotion.status !== 'error' && semanticBackfill.status !== 'error'
  return NextResponse.json({ ok, semanticBackfill, promotion }, { status: ok ? 200 : 500 })
}
