// saas/app/api/hub/webhooks/test/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { testWebhook } from '@/lib/hub/webhooks-service'
import { requirePermission } from '@/lib/auth/permission-middleware'

export async function POST(req: NextRequest) {
  const perm = await requirePermission(req, 'webhooks:read')
  if (!perm.ok) {
    return NextResponse.json(
      { ok: false, error: (perm as any).error },
      { status: (perm as any).status }
    )
  }

  try {
    const id = req.nextUrl.searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'Webhook ID required' },
        { status: 400 }
      )
    }

    const result = await testWebhook(id)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
