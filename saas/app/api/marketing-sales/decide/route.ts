// saas/app/api/marketing-sales/decide/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { createSignalBoostMarketingHost, signalboostActor } from '@/marketing-sales-host/signalboostHost'
import { decide } from '@/marketing-sales-core/flow'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  const actor = signalboostActor(ctx.user)
  const host = createSignalBoostMarketingHost(ctx.admin, actor)

  let body: any = {}
  try { body = await req.json() } catch { /* empty */ }
  const campaignId = String(body.campaignId || '')
  const decision = String(body.decision || '')
  if (!campaignId || !['approve', 'edits', 'reject'].includes(decision)) {
    return NextResponse.json({ ok: false, error: 'campaignId and a valid decision are required' }, { status: 400 })
  }
  const r = await decide(host, { campaignId, actor, decision: decision as any })
  return NextResponse.json(r, { status: r.ok ? 200 : 400 })
}
