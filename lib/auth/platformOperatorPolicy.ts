export type PlatformOperatorUser = {
  email?: string | null
  app_metadata?: Record<string, unknown> | null
}

export function isPlatformOperator(
  user: PlatformOperatorUser | null | undefined,
  ownerEmails: readonly string[] = [],
): boolean {
  if (!user) return false

  const role = String(user.app_metadata?.role ?? '').trim().toLowerCase()
  if (role === 'owner' || role === 'platform_operator') return true

  const email = String(user.email ?? '').trim().toLowerCase()
  // Normalize ownerEmails for case-insensitive comparison to prevent access denial due to casing mismatches
  const normalizedOwnerEmails = ownerEmails.map(e => e.trim().toLowerCase())
  return Boolean(email && normalizedOwnerEmails.includes(email))
}
