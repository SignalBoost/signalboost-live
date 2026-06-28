// saas/app/api/cos/mining/overview/route.ts
// Host binding: admin-gated mining intelligence for the cockpit. Thin — auth + delegate to
// the portable module's buildOverview(). Owner/admin only.

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/permission-middleware'
import { isMiningAdmin } from '@/lib/cos/host'
import { buildOverview } from '@/lib/cos/overview'
import { getMiningStore } from '@/lib/cos/mining/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getCurrentUser(req as any)
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (!isMiningAdmin({ id: user.id, email: user.email, role: user.role })) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const overview = await buildOverview(getMiningStore())
  return NextResponse.json({ ok: true, overview })
}
