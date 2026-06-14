// saas/app/api/hub/logs/stats/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getLogStats } from '@/lib/hub/logs-service'
import { requirePermission } from '@/lib/auth/permission-middleware'

export async function GET(req: NextRequest) {
  const perm = await requirePermission(req, 'logs:read')
  if (!perm.ok) {
    return NextResponse.json(
      { ok: false, error: (perm as any).error },
      { status: (perm as any).status }
    )
  }

  try {
    const result = await getLogStats()
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
