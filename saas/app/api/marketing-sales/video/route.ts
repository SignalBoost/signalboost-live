// saas/app/api/marketing-sales/video/route.ts
// Owner-gated manual trigger: start a real video render for one draft. The cron
// then advances it to 'ready' and fills asset_url. Honest — no fake asset is ever set.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { createSignalBoostMarketingHost, signalboostActor } from '@/marketing-sales-host/signalboostHost'
import { requestDraftVideo } from '@/marketing-sales-host/video'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  const actor = signalboostActor(ctx.user)
  const host = createSignalBoostMarketingHost(ctx.admin, actor)

  let body: any = {}
  try { body = await req.json() } catch { /* empty */ }
  const draftId = String(body.draftId || '')
  const aspectRatio = body.aspectRatio ? String(body.aspectRatio) : undefined
  const prompt = body.prompt ? String(body.prompt) : undefined
  if (!draftId) return NextResponse.json({ ok: false, error: 'draftId is required' }, { status: 400 })

  const r = await requestDraftVideo(host, draftId, { aspectRatio, prompt })
  return NextResponse.json(r, { status: r.ok ? 200 : 400 })
}
