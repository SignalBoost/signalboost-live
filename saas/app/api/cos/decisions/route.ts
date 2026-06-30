// saas/app/api/cos/decisions/route.ts
// Owner/admin read endpoint over the COS decision log. Service-role read,
// gated by getAccess. Powers the future Executive Console decision history.
import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { listCosDecisions } from '@/lib/ai/cos/decisionLog'

export async function GET(req: NextRequest) {
  let isPrivileged = false
  try {
    const access = await getAccess()
    isPrivileged = access.isAdmin
  } catch {
    isPrivileged = false
  }
  if (!isPrivileged) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const raw = Number(new URL(req.url).searchParams.get('limit') || '50')
  const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 200) : 50
  const res = await listCosDecisions({ limit })
  return NextResponse.json(res, { status: res.ok ? 200 : 500 })
}
