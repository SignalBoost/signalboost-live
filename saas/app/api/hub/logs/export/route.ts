// saas/app/api/hub/logs/export/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { exportLogsAsCSV } from '@/lib/hub/logs-service'
import { requirePermission } from '@/lib/auth/permission-middleware'

export async function GET(req: NextRequest) {
  const perm = await requirePermission(req, 'logs:export')
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

    const result = await exportLogsAsCSV({
      action: action || undefined,
      status: status || undefined,
      secretId: secretId || undefined,
      userEmail: userEmail || undefined,
    })

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
