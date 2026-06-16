// saas/lib/auth/permission-middleware.ts
// Permission checking middleware for API routes

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { HubUser, Permission } from './rbac-types'
import { hasPermission, hasAllPermissions, hasAnyPermission } from './rbac-service'
import { getAccess } from './access'

/**
 * Resolve the current hub user from the VERIFIED Supabase session.
 *
 * Authentication is delegated to getAccess(), which validates the Supabase auth
 * cookie server-side (the session JWT is verified by Supabase). This cannot be
 * spoofed by a request header. The hub role is then read from hub_workspace_users
 * keyed on the verified email, preserving operator/viewer/custom granularity.
 *
 * There is intentionally NO header-trust path and NO owner/synthetic-owner
 * fallback: an unauthenticated request resolves to null (denied); an authenticated
 * user with no hub role resolves to null unless they are a workspace owner/admin
 * per getAccess (OWNER_EMAILS / team_members). On any error we deny, never elevate.
 */
export async function getCurrentUser(_req: NextRequest): Promise<HubUser | null> {
  try {
    // 1. Verify the real session. 'guest' => not authenticated => no access.
    const access = await getAccess()
    if (access.role === 'guest' || !access.email) return null

    const email = access.email
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    // 2. Read the hub role for this VERIFIED email.
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey)
      const { data: hubUser } = await supabase
        .from('hub_workspace_users')
        .select('*')
        .eq('email', email)
        .single()
      if (hubUser && (hubUser as HubUser).active !== false) {
        return hubUser as HubUser
      }
    }

    // 3. Trusted owner/admin from getAccess (OWNER_EMAILS / team_members), even
    //    without an explicit hub_workspace_users row.
    if (access.role === 'owner' || access.role === 'admin') {
      const now = new Date().toISOString()
      return {
        id: access.userId || email,
        email,
        role: access.role as HubUser['role'],
        mfaEnabled: false,
        createdAt: now,
        updatedAt: now,
        lastLogin: now,
        active: true,
      } as HubUser
    }

    // 4. Authenticated but no hub role => deny. No owner fallback.
    return null
  } catch {
    // Deny on error — never elevate to owner.
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
