// saas/lib/auth/rbac-service.ts
// Role-based access control service

import { createClient } from '@supabase/supabase-js'
import { HubUser, Permission, Role, DEFAULT_ROLES } from './rbac-types'

/**
 * Check if user has permission
 */
export function hasPermission(user: HubUser | null, permission: Permission): boolean {
  if (!user) return false

  // Owner has all permissions
  if (user.role === 'owner') return true

  // Check built-in role permissions
  const role = DEFAULT_ROLES.find(r => r.name === user.role)
  if (role && role.permissions.includes(permission)) return true

  // Check custom permissions
  if (user.customPermissions && user.customPermissions.includes(permission)) return true

  return false
}

/**
 * Check multiple permissions (AND logic)
 */
export function hasAllPermissions(user: HubUser | null, permissions: Permission[]): boolean {
  return permissions.every(p => hasPermission(user, p))
}

/**
 * Check multiple permissions (OR logic)
 */
export function hasAnyPermission(user: HubUser | null, permissions: Permission[]): boolean {
  return permissions.some(p => hasPermission(user, p))
}

/**
 * List all users in the workspace
 */
export async function listWorkspaceUsers(): Promise<{
  ok: boolean
  users?: HubUser[]
  error?: string
}> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return { ok: false, error: 'Supabase credentials not configured' }
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data, error } = await supabase
      .from('hub_workspace_users')
      .select('*')
      .order('createdAt', { ascending: false })

    if (error) {
      return { ok: false, error: error.message }
    }

    return { ok: true, users: data || [] }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

/**
 * Invite user to workspace
 */
export async function inviteUser(email: string, role: Role): Promise<{
  ok: boolean
  user?: HubUser
  inviteLink?: string
  error?: string
}> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return { ok: false, error: 'Supabase credentials not configured' }
    }

    // Validate email
    if (!email.includes('@')) {
      return { ok: false, error: 'Invalid email address' }
    }

    // Validate role
    if (!['owner', 'admin', 'operator', 'viewer'].includes(role)) {
      return { ok: false, error: 'Invalid role' }
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Check if user already exists
    const { data: existing } = await supabase
      .from('hub_workspace_users')
      .select('*')
      .eq('email', email)
      .single()

    if (existing) {
      return { ok: false, error: 'User already exists in workspace' }
    }

    // Create user record
    const newUser: HubUser = {
      id: crypto.randomUUID(),
      email,
      role,
      mfaEnabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      active: true,
    }

    const { data, error } = await supabase
      .from('hub_workspace_users')
      .insert([newUser])
      .select()
      .single()

    if (error) {
      return { ok: false, error: error.message }
    }

    // Generate invite link (in production, send email)
    const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${newUser.id}&email=${encodeURIComponent(email)}`

    return {
      ok: true,
      user: data,
      inviteLink,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

/**
 * Update user role
 */
export async function updateUserRole(userId: string, newRole: Role): Promise<{
  ok: boolean
  user?: HubUser
  error?: string
}> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return { ok: false, error: 'Supabase credentials not configured' }
    }

    if (!['owner', 'admin', 'operator', 'viewer'].includes(newRole)) {
      return { ok: false, error: 'Invalid role' }
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data, error } = await supabase
      .from('hub_workspace_users')
      .update({
        role: newRole,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single()

    if (error) {
      return { ok: false, error: error.message }
    }

    return { ok: true, user: data }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

/**
 * Remove user from workspace
 */
export async function removeUser(userId: string): Promise<{
  ok: boolean
  error?: string
}> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return { ok: false, error: 'Supabase credentials not configured' }
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Check if this is the last owner
    const { data: allUsers } = await supabase
      .from('hub_workspace_users')
      .select('*')
      .eq('role', 'owner')

    if (allUsers && allUsers.length === 1 && allUsers[0].id === userId) {
      return { ok: false, error: 'Cannot remove the last owner' }
    }

    const { error } = await supabase
      .from('hub_workspace_users')
      .delete()
      .eq('id', userId)

    if (error) {
      return { ok: false, error: error.message }
    }

    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

/**
 * Enable MFA for user
 */
export async function enableMFAForUser(userId: string): Promise<{
  ok: boolean
  user?: HubUser
  error?: string
}> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return { ok: false, error: 'Supabase credentials not configured' }
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data, error } = await supabase
      .from('hub_workspace_users')
      .update({
        mfaEnabled: true,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single()

    if (error) {
      return { ok: false, error: error.message }
    }

    return { ok: true, user: data }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}
