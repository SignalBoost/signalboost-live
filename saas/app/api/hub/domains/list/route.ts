// saas/app/api/hub/domains/list/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { listVercelDomains } from '@/lib/hub/vercel-domains'

export async function GET(req: NextRequest) {
  try {
    const vercelToken = process.env.VERCEL_TOKEN
    const vercelTeamId = process.env.VERCEL_TEAM_ID
    const vercelProjectId = process.env.VERCEL_HUB_PROJECT

    if (!vercelToken || !vercelTeamId || !vercelProjectId) {
      return NextResponse.json(
        { ok: false, error: 'Vercel credentials not configured' },
        { status: 500 }
      )
    }

    const result = await listVercelDomains(vercelTeamId, vercelProjectId, vercelToken)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
