// saas/app/api/marketing-sales/console/route.ts
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { createSignalBoostMarketingHost, signalboostActor } from '@/marketing-sales-host/signalboostHost'
import { listConsole } from '@/marketing-sales-core/console'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  const actor = signalboostActor(ctx.user)
  const host = createSignalBoostMarketingHost(ctx.admin, actor)
  const r = await listConsole(host, actor.orgId)
  return NextResponse.json(r)
}
