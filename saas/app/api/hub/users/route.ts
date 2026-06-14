// saas/app/api/hub/users/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { listWorkspaceUsers, removeUser } from '@/lib/auth/rbac-service'
import { requirePermission } from '@/lib/auth/permission-middleware'

export async function GET(req: NextRequest) {
  const perm = await requirePermission(req, 'users:read')
  if (!perm.ok) {
    return NextResponse.json(
      { ok: false, error: (perm as any).error },
      { status: (perm as any).status }
    )
  }

  try {
    const result = await listWorkspaceUsers()
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const perm = await requirePermission(req, 'users:write')
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
        { ok: false, error: 'User ID required' },
        { status: 400 }
      )
    }

    const result = await removeUser(id)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
