// saas/app/api/hub/users/invite/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { inviteUser } from '@/lib/auth/rbac-service'
import { Role } from '@/lib/auth/rbac-types'
import { requirePermission } from '@/lib/auth/permission-middleware'

type InviteRequest = {
  email: string
  role: Role
}

export async function POST(req: NextRequest) {
  const perm = await requirePermission(req, 'users:write')
  if (!perm.ok) {
    return NextResponse.json(
      { ok: false, error: (perm as any).error },
      { status: (perm as any).status }
    )
  }

  try {
    const body: InviteRequest = await req.json()

    if (!body.email || !body.role) {
      return NextResponse.json(
        { ok: false, error: 'Email and role required' },
        { status: 400 }
      )
    }

    const result = await inviteUser(body.email, body.role)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
