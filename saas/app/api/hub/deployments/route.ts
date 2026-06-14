// saas/app/api/hub/deployments/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getVercelDeployments } from '@/lib/hub/deployments-service'
import { requirePermission } from '@/lib/auth/permission-middleware'

export async function GET(req: NextRequest) {
  const perm = await requirePermission(req, 'deployments:read')
  if (!perm.ok) {
    return NextResponse.json(
      { ok: false, error: (perm as any).error },
      { status: (perm as any).status }
    )
  }

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

    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20')
    const result = await getVercelDeployments(vercelTeamId, vercelProjectId, vercelToken, limit)

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
