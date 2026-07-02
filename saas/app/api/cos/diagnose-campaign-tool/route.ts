// saas/app/api/cos/diagnose-campaign-tool/route.ts
// Deterministic diagnostic: calls proposeCampaign() DIRECTLY — the exact same
// function the chat's proposeMarketingCampaign tool runs — with no AI model in
// the loop. Whatever happens is reported verbatim: the flat {ok,error} result,
// or a thrown exception with its message and stack top. Owner-only.
//
// NOTE: with ?run=1 this creates a REAL campaign and starts a REAL video
// render (normal pipeline cost, ~$0.42 for the Kling clip). That is
// intentional — a successful run doubles as the live test campaign and will
// appear on /dashboard/cosa immediately. Without ?run=1 it only explains
// itself and does nothing.

import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const ctx = await getAccess()
  if (!ctx.isOwner) {
    return NextResponse.json({ ok: false, error: 'Owner only. Log in as the owner, then reload.' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  if (searchParams.get('run') !== '1') {
    return NextResponse.json({
      ok: true,
      mode: 'dry',
      explain: 'Add ?run=1 to this URL to execute the real campaign-creation function directly (bypassing the AI chat layer). It will create a real campaign and start a real render — a successful run appears on /dashboard/cosa immediately.',
    })
  }

  const startedAt = Date.now()
  try {
    const { proposeCampaign } = await import('@/lib/ai/proposeCampaign')
    const result = await proposeCampaign({
      goal: 'DIAGNOSTIC TEST: YouTube marketing campaign for SignalBoostAi targeting small business owners, hotels and restaurants, promoting our AI growth platform.',
      audience: 'Small business owners, hotels, restaurants, entrepreneurs.',
      channel: 'youtube',
      language: 'en',
      callToAction: 'Visit www.saas.signalboostapp.com',
    })
    return NextResponse.json({
      ok: true,
      tookMs: Date.now() - startedAt,
      result,
      verdict: result.ok
        ? `proposeCampaign works when called directly — campaign ${result.campaignId} was created (check /dashboard/cosa). If chat still fails, the fault is in the AI tool-call layer, not the pipeline.`
        : `proposeCampaign returned a clean failure: "${result.error}". This is the exact same failure the chat tool hits — fix this and chat creation works.`,
    })
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      tookMs: Date.now() - startedAt,
      thrown: e?.message || 'unknown exception',
      stackTop: String(e?.stack || '').split('\n').slice(0, 6),
      verdict: 'proposeCampaign THREW an exception (not a clean error). This is almost certainly what silently kills the chat tool call. The stackTop above names the exact file and line.',
    })
  }
}
