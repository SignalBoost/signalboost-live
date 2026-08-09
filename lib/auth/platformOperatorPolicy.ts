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

  const emailVerified = user.email_verified === true || user.app_metadata?.email_verified === true
  if (!emailVerified) return false

  const email = String(user.email ?? '').trim().toLowerCase()
  return Boolean(
    email && ownerEmails.some((ownerEmail) => ownerEmail.trim().toLowerCase() === email),
  )
}
