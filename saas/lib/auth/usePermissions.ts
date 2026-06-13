// saas/lib/auth/usePermissions.ts
// React hook for permission checks in client components

'use client'

import { useContext, createContext, ReactNode } from 'react'
import { HubUser, Permission } from './rbac-types'
import { hasPermission, hasAllPermissions, hasAnyPermission } from './rbac-service'

// User context - in production, populated by auth provider
export const UserContext = createContext<HubUser | null>(null)

/**
 * Hook to get current user
 */
export function useUser(): HubUser | null {
  const user = useContext(UserContext)
  return user
}

/**
 * Hook to check permission
 */
export function usePermission(permission: Permission): boolean {
  const user = useContext(UserContext)
  return hasPermission(user, permission)
}

/**
 * Hook to check multiple permissions (AND)
 */
export function useAllPermissions(permissions: Permission[]): boolean {
  const user = useContext(UserContext)
  return hasAllPermissions(user, permissions)
}

/**
 * Hook to check multiple permissions (OR)
 */
export function useAnyPermission(permissions: Permission[]): boolean {
  const user = useContext(UserContext)
  return hasAnyPermission(user, permissions)
}

/**
 * Permission guard component - hides content if user lacks permission
 */
export function PermissionGate({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission
  children: ReactNode
  fallback?: ReactNode
}) {
  const hasAccess = usePermission(permission)
  return hasAccess ? <>{children}</> : <>{fallback}</>
}

/**
 * Permission gate for multiple permissions (AND)
 */
export function AllPermissionsGate({
  permissions,
  children,
  fallback = null,
}: {
  permissions: Permission[]
  children: ReactNode
  fallback?: ReactNode
}) {
  const hasAccess = useAllPermissions(permissions)
  return hasAccess ? <>{children}</> : <>{fallback}</>
}

/**
 * Permission gate for multiple permissions (OR)
 */
export function AnyPermissionGate({
  permissions,
  children,
  fallback = null,
}: {
  permissions: Permission[]
  children: ReactNode
  fallback?: ReactNode
}) {
  const hasAccess = useAnyPermission(permissions)
  return hasAccess ? <>{children}</> : <>{fallback}</>
}
