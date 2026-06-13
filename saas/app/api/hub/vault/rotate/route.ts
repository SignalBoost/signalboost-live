// saas/app/api/hub/vault/rotate/route.ts (EXAMPLE)
// Protected route - requires vault:rotate permission
// This shows how to add permission checks to existing routes

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/permission-middleware'
import { HubUser } from '@/lib/auth/rbac-types'

/**
 * POST /api/hub/vault/rotate
 * Rotate a vault key - requires vault:rotate permission
 */
export async function POST(req: NextRequest) {
  // Check permission
  const permResult = await requirePermission(req, 'vault:rotate')

  if (!permResult.ok) {
    return NextResponse.json(
      { ok: false, error: permResult.error },
      { status: permResult.status }
    )
  }

  const user: HubUser = permResult.user

  try {
    const body = await req.json()
    const { secretId } = body

    if (!secretId) {
      return NextResponse.json(
        { ok: false, error: 'Secret ID required' },
        { status: 400 }
      )
    }

    // Your rotation logic here
    // This is just a placeholder
    const result = {
      ok: true,
      message: `Key rotated by ${user.email}`,
      rotatedAt: new Date().toISOString(),
      rotatedBy: user.email,
    }

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
