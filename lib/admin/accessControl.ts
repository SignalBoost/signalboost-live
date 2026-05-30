export const adminRoles = ['owner', 'admin'] as const

export type AdminRole = (typeof adminRoles)[number]

export type AdminAccessResult = {
  allowed: boolean
  role: string
  reason: string
}

export function isAdminRole(role: string): role is AdminRole {
  return adminRoles.includes(role as AdminRole)
}

export function getAdminRole(headersList: Headers): string {
  return (
    headersList.get('x-signalboost-role') ||
    headersList.get('x-user-role') ||
    headersList.get('x-vercel-user-role') ||
    'guest'
  ).toLowerCase()
}

export function requireAdminAccess(headersList: Headers): AdminAccessResult {
  const role = getAdminRole(headersList)

  if (isAdminRole(role)) {
    return {
      allowed: true,
      role,
      reason: 'Owner/admin role verified for executive telemetry.',
    }
  }

  return {
    allowed: false,
    role,
    reason: 'Executive dashboard and admin telemetry require owner/admin access.',
  }
}
