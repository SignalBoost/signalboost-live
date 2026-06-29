// saas/app/api/marketing-sales/publish/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import '@/marketing-sales-host/registerExecutors' // core stubs + real host connectors (host wins)
import { createSignalBoostMarketingHost, signalboostActor } from '@/marketing-sales-host/signalboostHost'
import { publishCampaign } from '@/marketing-sales-core/publish'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  const actor = signalboostActor(ctx.user)
  const host = createSignalBoostMarketingHost(ctx.admin, actor)

  let body: any = {}
  try { body = await req.json() } catch { /* empty */ }
  const campaignId = String(body.campaignId || '')
  const connectorId = String(body.connectorId || 'site')
  if (!campaignId) return NextResponse.json({ ok: false, error: 'campaignId is required' }, { status: 400 })

  const r = await publishCampaign(host, { campaignId, connectorId, actorId: actor.id })
  return NextResponse.json(r, { status: r.ok ? 200 : 400 })
}
