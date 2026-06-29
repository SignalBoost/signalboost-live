// saas/app/api/marketing-sales/campaigns/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { createSignalBoostMarketingHost, signalboostActor } from '@/marketing-sales-host/signalboostHost'
import { createCampaign, addDraftsAndQueue, listForApproval } from '@/marketing-sales-core/flow'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  const actor = signalboostActor(ctx.user)
  const host = createSignalBoostMarketingHost(ctx.admin, actor)
  const r = await listForApproval(host, actor.orgId)
  return NextResponse.json(r)
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  const actor = signalboostActor(ctx.user)
  const host = createSignalBoostMarketingHost(ctx.admin, actor)

  let body: any = {}
  try { body = await req.json() } catch { /* empty */ }
  const objective = String(body.objective || '').trim()
  const drafts = Array.isArray(body.drafts) ? body.drafts : []
  if (!objective) return NextResponse.json({ ok: false, error: 'objective is required' }, { status: 400 })

  const c = await createCampaign(host, { orgId: actor.orgId, actorId: actor.id, objective, channel: body.channel || null })
  if (!c.ok) return NextResponse.json(c, { status: 500 })
  if (drafts.length) {
    const q = await addDraftsAndQueue(host, { campaign: c.data, drafts })
    if (!q.ok) return NextResponse.json(q, { status: 400 })
  }
  return NextResponse.json({ ok: true, data: c.data })
}
