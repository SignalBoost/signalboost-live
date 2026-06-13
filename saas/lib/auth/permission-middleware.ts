// saas/lib/auth/permission-middleware.ts
// Permission checking middleware for API routes

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { HubUser, Permission } from './rbac-types'
import { hasPermission, hasAllPermissions, hasAnyPermission } from './rbac-service'

/**
 * Get current user from request context
 * In production: extract from JWT token or session
 */
export async function getCurrentUser(req: NextRequest): Promise<HubUser | null> {
  try {
    // Check for Authorization header with Bearer token
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return null
    }

    const token = authHeader.substring(7)

    // In production: verify JWT token and extract user ID
    // For now: extract user ID from token (would be JWT sub claim)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return null
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Try to get user from session or JWT
    // This is a placeholder - in production use proper JWT verification
    const { data } = await supabase.from('hub_workspace_users').select('*').limit(1)

    if (data && data.length > 0) {
      return data[0] as HubUser
    }

    return null
  } catch (err) {
    return null
  }
}

/**
 * Require single permission
 */
export async function requirePermission(
  req: NextRequest,
  permission: Permission
): Promise<{ ok: true; user: HubUser } | { ok: false; error: string; status: number }> {
  const user = await getCurrentUser(req)

  if (!user) {
    return {
      ok: false,
      error: 'Unauthorized - authentication required',
      status: 401,
    }
  }

  if (!hasPermission(user, permission)) {
    await logPermissionDenial(user, permission, req)
    return {
      ok: false,
      error: `Forbidden - ${permission} permission required`,
      status: 403,
    }
  }

  return { ok: true, user }
}

/**
 * Require all permissions (AND logic)
 */
export async function requireAllPermissions(
  req: NextRequest,
  permissions: Permission[]
): Promise<{ ok: true; user: HubUser } | { ok: false; error: string; status: number }> {
  const user = await getCurrentUser(req)

  if (!user) {
    return {
      ok: false,
      error: 'Unauthorized - authentication required',
      status: 401,
    }
  }

  if (!hasAllPermissions(user, permissions)) {
    await logPermissionDenial(user, permissions[0], req)
    return {
      ok: false,
      error: `Forbidden - requires all of: ${permissions.join(', ')}`,
      status: 403,
    }
  }

  return { ok: true, user }
}

/**
 * Require any permission (OR logic)
 */
export async function requireAnyPermission(
  req: NextRequest,
  permissions: Permission[]
): Promise<{ ok: true; user: HubUser } | { ok: false; error: string; status: number }> {
  const user = await getCurrentUser(req)

  if (!user) {
    return {
      ok: false,
      error: 'Unauthorized - authentication required',
      status: 401,
    }
  }

  if (!hasAnyPermission(user, permissions)) {
    await logPermissionDenial(user, permissions[0], req)
    return {
      ok: false,
      error: `Forbidden - requires one of: ${permissions.join(', ')}`,
      status: 403,
    }
  }

  return { ok: true, user }
}

/**
 * Log permission denial for audit trail
 */
async function logPermissionDenial(user: HubUser, permission: Permission, req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) return

    const supabase = createClient(supabaseUrl, supabaseKey)

    await supabase.from('hub_vault_audit_log').insert([
      {
        secret_id: 'permission-denial',
        action: 'accessed',
        user_email: user.email,
        timestamp: new Date().toISOString(),
        status: 'failed',
        message: `Unauthorized access attempt: ${permission} on ${req.nextUrl.pathname}`,
        ip_address: req.headers.get('x-forwarded-for') || 'unknown',
      },
    ])
  } catch (err) {
    // Non-fatal - logging failure shouldn't break the request
  }
}

/**
 * Create protected route wrapper
 */
export function createProtectedRoute(
  handler: (req: NextRequest, user: HubUser) => Promise<NextResponse>,
  requiredPermission: Permission
) {
  return async (req: NextRequest) => {
    const result = await requirePermission(req, requiredPermission)

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: (result as any).error },
        { status: (result as any).status }
      )
    }

    return handler(req, result.user)
  }
}

/**
 * Create protected route wrapper (multiple permissions - AND)
 */
export function createProtectedRouteAll(
  handler: (req: NextRequest, user: HubUser) => Promise<NextResponse>,
  requiredPermissions: Permission[]
) {
  return async (req: NextRequest) => {
    const result = await requireAllPermissions(req, requiredPermissions)

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: (result as any).error },
        { status: (result as any).status }
      )
    }

    return handler(req, result.user)
  }
}

/**
 * Create protected route wrapper (multiple permissions - OR)
 */
export function createProtectedRouteAny(
  handler: (req: NextRequest, user: HubUser) => Promise<NextResponse>,
  requiredPermissions: Permission[]
) {
  return async (req: NextRequest) => {
    const result = await requireAnyPermission(req, requiredPermissions)

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: (result as any).error },
        { status: (result as any).status }
      )
    }

    return handler(req, result.user)
  }
}
