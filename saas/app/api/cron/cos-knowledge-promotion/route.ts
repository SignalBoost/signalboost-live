import { NextRequest, NextResponse } from 'next/server'
import { autoPromoteLearnedKnowledge } from '@/lib/ai/cos/autoPromoteLearning'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Leave 15 seconds for persistence and the HTTP response. autoPromoteLearnedKnowledge
  // will not begin another local-model extraction unless enough time remains for a cold
  // start plus inference, so Vercel cannot kill this route merely because the prior
  // learning/mining job consumed most of a shared deadline.
  const deadlineMs = Date.now() + 285_000
  const promotion = await autoPromoteLearnedKnowledge(5, deadlineMs)
  const ok = promotion.status !== 'error'
  return NextResponse.json({ ok, promotion }, { status: ok ? 200 : 500 })
}
