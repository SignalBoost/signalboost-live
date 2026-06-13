// saas/app/api/hub/users/role/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { updateUserRole } from '@/lib/auth/rbac-service'
import { Role } from '@/lib/auth/rbac-types'

type RoleUpdateRequest = {
  userId: string
  role: Role
}

export async function POST(req: NextRequest) {
  try {
    const body: RoleUpdateRequest = await req.json()

    if (!body.userId || !body.role) {
      return NextResponse.json(
        { ok: false, error: 'User ID and role required' },
        { status: 400 }
      )
    }

    const result = await updateUserRole(body.userId, body.role)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
