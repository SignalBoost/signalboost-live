import { withScheduledProductionHarnessIngress } from '@/platform-harness/runtime/scheduled-ingress'
import { NextRequest, NextResponse } from 'next/server'
import { runOwnerExecutiveBriefing } from '@/lib/ai/cos/ownerExecutiveBriefing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

async function GETInsideScheduledHarness(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await runOwnerExecutiveBriefing()
    return NextResponse.json(result, { status: result.ok ? 200 : 503 })
  } catch (error) {
    console.error('[cos-owner-briefing] failed', error)
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message.slice(0, 300) : 'owner_briefing_failed' }, { status: 500 })
  }
}

async function POSTInsideScheduledHarness(req: NextRequest) { return GET(req) }


// Platform Harness scheduled ingress: no background worker logic starts outside a bounded run.
export async function GET(...args: Parameters<typeof GETInsideScheduledHarness>) {
  return withScheduledProductionHarnessIngress({ routePath: '/api/cron/cos-owner-briefing' }, async () => GETInsideScheduledHarness(...args))
}
export async function POST(...args: Parameters<typeof POSTInsideScheduledHarness>) {
  return withScheduledProductionHarnessIngress({ routePath: '/api/cron/cos-owner-briefing' }, async () => POSTInsideScheduledHarness(...args))
}
