// saas/lib/auth/permission-middleware.ts
// Owner-only permission checking middleware for protected Hub API routes.

import { NextRequest, NextResponse } from 'next/server'
import { HubUser, Permission } from './rbac-types'
import { hasPermission, hasAllPermissions, hasAnyPermission } from './rbac-service'
import { getAccess } from './access'
import { recordAuditEvent } from '@/lib/hub/audit'

export async function getCurrentUser(_req: NextRequest): Promise<HubUser | null> {
  try {
    const access = await getAccess()
    if (!access.isOwner || !access.email) return null

    const now = new Date().toISOString()
    return {
      id: access.userId || access.email,
      email: access.email,
      role: 'owner',
      mfaEnabled: false,
      createdAt: now,
      updatedAt: now,
      lastLogin: now,
      active: true,
    } as HubUser
  } catch {
    return null
  }
}

export async function requirePermission(
  req: NextRequest,
  permission: Permission,
): Promise<{ ok: true; user: HubUser } | { ok: false; error: string; status: number }> {
  const user = await getCurrentUser(req)
  if (!user) return { ok: false, error: 'Unauthorized - owner authentication required', status: 401 }
  if (!hasPermission(user, permission)) {
    await logPermissionDenial(user, permission, req)
    return { ok: false, error: `Forbidden - ${permission} permission required`, status: 403 }
  }
  return { ok: true, user }
}

export async function requireAllPermissions(
  req: NextRequest,
  permissions: Permission[],
): Promise<{ ok: true; user: HubUser } | { ok: false; error: string; status: number }> {
  const user = await getCurrentUser(req)
  if (!user) return { ok: false, error: 'Unauthorized - owner authentication required', status: 401 }
  if (!hasAllPermissions(user, permissions)) {
    await logPermissionDenial(user, permissions[0], req)
    return { ok: false, error: `Forbidden - requires all of: ${permissions.join(', ')}`, status: 403 }
  }
  return { ok: true, user }
}

export async function requireAnyPermission(
  req: NextRequest,
  permissions: Permission[],
): Promise<{ ok: true; user: HubUser } | { ok: false; error: string; status: number }> {
  const user = await getCurrentUser(req)
  if (!user) return { ok: false, error: 'Unauthorized - owner authentication required', status: 401 }
  if (!hasAnyPermission(user, permissions)) {
    await logPermissionDenial(user, permissions[0], req)
    return { ok: false, error: `Forbidden - requires one of: ${permissions.join(', ')}`, status: 403 }
  }
  return { ok: true, user }
}

async function logPermissionDenial(user: HubUser, permission: Permission, req: NextRequest) {
  await recordAuditEvent({
    actor: user.email,
    action: String(permission),
    status: 'denied',
    target: req.nextUrl.pathname,
    message: `Unauthorized access attempt: ${permission} on ${req.nextUrl.pathname}`,
    ip: req.headers.get('x-forwarded-for') || 'unknown',
  })
}

export function createProtectedRoute(
  handler: (req: NextRequest, user: HubUser) => Promise<NextResponse>,
  requiredPermission: Permission,
) {
  return async (req: NextRequest) => {
    const result = await requirePermission(req, requiredPermission)
    if ('error' in result) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status })
    }
    return handler(req, result.user)
  }
}

export function createProtectedRouteAll(
  handler: (req: NextRequest, user: HubUser) => Promise<NextResponse>,
  requiredPermissions: Permission[],
) {
  return async (req: NextRequest) => {
    const result = await requireAllPermissions(req, requiredPermissions)
    if ('error' in result) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status })
    }
    return handler(req, result.user)
  }
}

export function createProtectedRouteAny(
  handler: (req: NextRequest, user: HubUser) => Promise<NextResponse>,
  requiredPermissions: Permission[],
) {
  return async (req: NextRequest) => {
    const result = await requireAnyPermission(req, requiredPermissions)
    if ('error' in result) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status })
    }
    return handler(req, result.user)
  }
}
