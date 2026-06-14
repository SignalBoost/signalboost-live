// saas/app/api/hub/logs/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getAuditLogs } from '@/lib/hub/logs-service'
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
    const action = req.nextUrl.searchParams.get('action') || undefined
    const status = req.nextUrl.searchParams.get('status') || undefined
    const secretId = req.nextUrl.searchParams.get('secretId') || undefined
    const userEmail = req.nextUrl.searchParams.get('userEmail') || undefined
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50')
    const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0')

    const result = await getAuditLogs({
      action: action || undefined,
      status: status || undefined,
      secretId: secretId || undefined,
      userEmail: userEmail || undefined,
      limit,
      offset,
    })

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
