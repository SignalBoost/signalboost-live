export type PlatformOperatorUser = {
  email?: string | null
  email_verified?: boolean | null
  app_metadata?: Record<string, unknown> | null
}

export function isPlatformOperator(
  user: PlatformOperatorUser | null | undefined,
  ownerEmails: readonly string[] = [],
): boolean {
  if (!user) return false

  const role = String(user.app_metadata?.role ?? '').trim().toLowerCase()
  if (role === 'owner' || role === 'platform_operator') return true

  if (user.email_verified !== true) return false

  const email = String(user.email ?? '').trim().toLowerCase()
  return Boolean(
    email && ownerEmails.some(ownerEmail => String(ownerEmail).trim().toLowerCase() === email),
  )
}
